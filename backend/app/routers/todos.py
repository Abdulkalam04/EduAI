"""
Todos router  –  /api/todos/*

Every route is auth-required (via api_dependencies in main.py).
Every query is scoped to current_user.uid; a foreign id returns 404.
"Exactly one active list per user" is enforced inside a single transaction.
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator, model_validator
from sqlalchemy import select, update
from sqlalchemy.orm import Session, selectinload

from app.auth import AuthUser, get_current_user
from app.database import get_db
from app.models import TodoItem, TodoList

router = APIRouter(prefix="/api/todos", tags=["todos"])

# ── constants ────────────────────────────────────────────────────────────────
MAX_ITEMS_PER_LIST = 100
MAX_ITEMS_PER_CALL = 50
MAX_LISTS_PER_USER = 200
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
CTRL_RE = re.compile(r"[\x00-\x1f\x7f]")


# ── helpers ──────────────────────────────────────────────────────────────────

def _clean(text: str) -> str:
    """Trim, collapse internal whitespace, strip control characters."""
    text = CTRL_RE.sub(" ", text)
    return " ".join(text.split())


def _valid_date(v: str | None, field: str = "date") -> str | None:
    if v is None:
        return None
    if not DATE_RE.match(v):
        raise ValueError(f"{field} must be a valid ISO date (YYYY-MM-DD)")
    try:
        datetime.strptime(v, "%Y-%m-%d")
    except ValueError:
        raise ValueError(f"{field} is not a valid calendar date")
    return v


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _get_list_or_404(db: Session, list_id: str, user_id: str) -> TodoList:
    todo_list = db.get(TodoList, list_id, options=[selectinload(TodoList.items)])
    if not todo_list or todo_list.user_id != user_id:
        raise HTTPException(status_code=404, detail="List not found.")
    return todo_list


def _get_item_or_404(db: Session, item_id: str, user_id: str) -> TodoItem:
    item = db.get(TodoItem, item_id)
    if not item or item.user_id != user_id:
        raise HTTPException(status_code=404, detail="Item not found.")
    return item


def _deactivate_all(db: Session, user_id: str) -> None:
    """Deactivate all lists for the user (call inside an open transaction)."""
    db.execute(
        update(TodoList)
        .where(TodoList.user_id == user_id, TodoList.is_active.is_(True))
        .values(is_active=False, updated_at=_now())
    )


def _list_to_dict(todo_list: TodoList, include_items: bool = True) -> dict[str, Any]:
    items = todo_list.items if include_items else []
    total = len(todo_list.items)
    done_count = sum(1 for i in todo_list.items if i.done)
    return {
        "id": todo_list.id,
        "user_id": todo_list.user_id,
        "title": todo_list.title,
        "plan_date": todo_list.plan_date,
        "is_active": todo_list.is_active,
        "total": total,
        "done": done_count,
        "created_at": todo_list.created_at.isoformat(),
        "updated_at": todo_list.updated_at.isoformat(),
        "items": [_item_to_dict(i) for i in items],
    }


def _item_to_dict(item: TodoItem) -> dict[str, Any]:
    return {
        "id": item.id,
        "list_id": item.list_id,
        "user_id": item.user_id,
        "text": item.text,
        "done": item.done,
        "done_at": item.done_at.isoformat() if item.done_at else None,
        "due_date": item.due_date,
        "position": item.position,
        "created_at": item.created_at.isoformat(),
    }


# ── Pydantic schemas ─────────────────────────────────────────────────────────

class ItemInput(BaseModel):
    text: str
    due_date: str | None = None

    @field_validator("text")
    @classmethod
    def validate_text(cls, v: str) -> str:
        v = _clean(v)
        if not v:
            raise ValueError("Item text cannot be empty.")
        if len(v) > 300:
            raise ValueError("Item text must be 300 characters or fewer.")
        return v

    @field_validator("due_date")
    @classmethod
    def validate_due_date(cls, v: str | None) -> str | None:
        return _valid_date(v, "due_date")


class CreateListBody(BaseModel):
    title: str | None = None
    plan_date: str
    items: list[ItemInput] = []

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = _clean(v)
        if not v:
            return None
        if len(v) > 120:
            raise ValueError("Title must be 120 characters or fewer.")
        return v

    @field_validator("plan_date")
    @classmethod
    def validate_plan_date(cls, v: str) -> str:
        result = _valid_date(v, "plan_date")
        if result is None:
            raise ValueError("plan_date is required.")
        return result

    @field_validator("items")
    @classmethod
    def validate_items(cls, v: list[ItemInput]) -> list[ItemInput]:
        if len(v) > MAX_ITEMS_PER_CALL:
            raise ValueError(f"Cannot create more than {MAX_ITEMS_PER_CALL} items at once.")
        return v


class PatchListBody(BaseModel):
    title: str | None = None
    plan_date: str | None = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = _clean(v)
        if not v:
            raise ValueError("Title cannot be empty.")
        if len(v) > 120:
            raise ValueError("Title must be 120 characters or fewer.")
        return v

    @field_validator("plan_date")
    @classmethod
    def validate_plan_date(cls, v: str | None) -> str | None:
        return _valid_date(v, "plan_date")


class ActivateBody(BaseModel):
    plan_date: str | None = None

    @field_validator("plan_date")
    @classmethod
    def validate_plan_date(cls, v: str | None) -> str | None:
        return _valid_date(v, "plan_date")


class CopyBody(BaseModel):
    only_unfinished: bool
    plan_date: str
    title: str | None = None

    @field_validator("plan_date")
    @classmethod
    def validate_plan_date(cls, v: str) -> str:
        result = _valid_date(v, "plan_date")
        if result is None:
            raise ValueError("plan_date is required.")
        return result

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = _clean(v)
        if not v:
            return None
        if len(v) > 120:
            raise ValueError("Title must be 120 characters or fewer.")
        return v


class AppendItemsBody(BaseModel):
    items: list[ItemInput]

    @field_validator("items")
    @classmethod
    def validate_items(cls, v: list[ItemInput]) -> list[ItemInput]:
        if not v:
            raise ValueError("At least one item is required.")
        if len(v) > MAX_ITEMS_PER_CALL:
            raise ValueError(f"Cannot append more than {MAX_ITEMS_PER_CALL} items at once.")
        return v


class PatchItemBody(BaseModel):
    text: str | None = None
    done: bool | None = None
    due_date: str | None = None

    @field_validator("text")
    @classmethod
    def validate_text(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = _clean(v)
        if not v:
            raise ValueError("Item text cannot be empty.")
        if len(v) > 300:
            raise ValueError("Item text must be 300 characters or fewer.")
        return v

    @field_validator("due_date")
    @classmethod
    def validate_due_date(cls, v: str | None) -> str | None:
        return _valid_date(v, "due_date")

    @model_validator(mode="after")
    def at_least_one(self) -> "PatchItemBody":
        if self.text is None and self.done is None and self.due_date is None:
            raise ValueError("At least one field (text, done, due_date) must be provided.")
        return self


class OrderBody(BaseModel):
    item_ids: list[str]


class ToggleAllBody(BaseModel):
    done: bool


# ── GET /api/todos/active ────────────────────────────────────────────────────

@router.get("/active")
def get_active_list(
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user),
):
    todo_list = db.scalars(
        select(TodoList)
        .where(TodoList.user_id == current_user.uid, TodoList.is_active.is_(True))
        .options(selectinload(TodoList.items))
        .limit(1)
    ).first()
    if todo_list is None:
        return None
    return _list_to_dict(todo_list)


# ── GET /api/todos/lists ─────────────────────────────────────────────────────

@router.get("/lists")
def list_todo_lists(
    status: str = "unfinished",
    limit: int = 30,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user),
):
    limit = max(1, min(100, limit))
    query = (
        select(TodoList)
        .where(TodoList.user_id == current_user.uid)
        .options(selectinload(TodoList.items))
        .order_by(TodoList.updated_at.desc())
        .limit(limit)
    )
    lists = db.scalars(query).all()

    result = []
    for todo_list in lists:
        total = len(todo_list.items)
        done_count = sum(1 for i in todo_list.items if i.done)
        has_unfinished = any(not i.done for i in todo_list.items)
        if status == "unfinished" and not has_unfinished and total > 0:
            continue
        preview_items = [i.text for i in todo_list.items if not i.done][:2]
        result.append(
            {
                "id": todo_list.id,
                "title": todo_list.title,
                "plan_date": todo_list.plan_date,
                "total": total,
                "done": done_count,
                "is_active": todo_list.is_active,
                "updated_at": todo_list.updated_at.isoformat(),
                "previewItems": preview_items,
            }
        )
    return result


# ── POST /api/todos/lists ────────────────────────────────────────────────────

@router.post("/lists", status_code=201)
def create_list(
    body: CreateListBody,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user),
):
    # Enforce per-user list limit
    count = db.scalar(
        select(TodoList.id).where(TodoList.user_id == current_user.uid).with_only_columns(
            TodoList.id
        )
    )
    # count via a proper count query
    from sqlalchemy import func
    list_count = db.scalar(
        select(func.count()).select_from(TodoList).where(TodoList.user_id == current_user.uid)
    ) or 0
    if list_count >= MAX_LISTS_PER_USER:
        raise HTTPException(
            status_code=409,
            detail=f"You have reached the maximum of {MAX_LISTS_PER_USER} lists. "
                   "Please delete old lists to create a new one.",
        )
    if len(body.items) > MAX_ITEMS_PER_LIST:
        raise HTTPException(
            status_code=422,
            detail=f"A list can have at most {MAX_ITEMS_PER_LIST} items.",
        )
    title = body.title or f"Plan for {_weekday_label(body.plan_date)}"
    now = _now()
    new_list = TodoList(
        id=str(uuid.uuid4()),
        user_id=current_user.uid,
        title=title,
        plan_date=body.plan_date,
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    items = [
        TodoItem(
            id=str(uuid.uuid4()),
            list_id=new_list.id,
            user_id=current_user.uid,
            text=it.text,
            due_date=it.due_date,
            position=pos,
            created_at=now,
        )
        for pos, it in enumerate(body.items)
    ]
    # All in one transaction: deactivate others, save new
    _deactivate_all(db, current_user.uid)
    db.add(new_list)
    db.add_all(items)
    db.commit()
    db.refresh(new_list)
    # reload items via relationship
    db.expire(new_list)
    todo_list = db.get(TodoList, new_list.id, options=[selectinload(TodoList.items)])
    return _list_to_dict(todo_list)  # type: ignore[arg-type]


# ── PATCH /api/todos/lists/{id} ──────────────────────────────────────────────

@router.patch("/lists/{list_id}")
def patch_list(
    list_id: str,
    body: PatchListBody,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user),
):
    todo_list = _get_list_or_404(db, list_id, current_user.uid)
    if body.title is not None:
        todo_list.title = body.title
    if body.plan_date is not None:
        todo_list.plan_date = body.plan_date
    todo_list.updated_at = _now()
    db.commit()
    db.expire(todo_list)
    todo_list = db.get(TodoList, list_id, options=[selectinload(TodoList.items)])
    return _list_to_dict(todo_list)  # type: ignore[arg-type]


# ── DELETE /api/todos/lists/{id} ─────────────────────────────────────────────

@router.delete("/lists/{list_id}", status_code=204)
def delete_list(
    list_id: str,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user),
):
    todo_list = _get_list_or_404(db, list_id, current_user.uid)
    db.delete(todo_list)
    db.commit()


# ── POST /api/todos/lists/{id}/activate ─────────────────────────────────────

@router.post("/lists/{list_id}/activate")
def activate_list(
    list_id: str,
    body: ActivateBody = ActivateBody(),
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user),
):
    todo_list = _get_list_or_404(db, list_id, current_user.uid)
    _deactivate_all(db, current_user.uid)
    todo_list.is_active = True
    if body.plan_date:
        todo_list.plan_date = body.plan_date
    todo_list.updated_at = _now()
    db.commit()
    db.expire(todo_list)
    todo_list = db.get(TodoList, list_id, options=[selectinload(TodoList.items)])
    return _list_to_dict(todo_list)  # type: ignore[arg-type]


# ── POST /api/todos/lists/{id}/copy ─────────────────────────────────────────

@router.post("/lists/{list_id}/copy", status_code=201)
def copy_list(
    list_id: str,
    body: CopyBody,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user),
):
    from sqlalchemy import func
    list_count = db.scalar(
        select(func.count()).select_from(TodoList).where(TodoList.user_id == current_user.uid)
    ) or 0
    if list_count >= MAX_LISTS_PER_USER:
        raise HTTPException(
            status_code=409,
            detail=f"You have reached the maximum of {MAX_LISTS_PER_USER} lists. "
                   "Please delete old lists to create a new one.",
        )
    source = _get_list_or_404(db, list_id, current_user.uid)
    items_to_copy = (
        [i for i in source.items if not i.done] if body.only_unfinished else list(source.items)
    )
    title = body.title or f"Plan for {_weekday_label(body.plan_date)}"
    now = _now()
    new_list = TodoList(
        id=str(uuid.uuid4()),
        user_id=current_user.uid,
        title=title,
        plan_date=body.plan_date,
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    new_items = [
        TodoItem(
            id=str(uuid.uuid4()),
            list_id=new_list.id,
            user_id=current_user.uid,
            text=src.text,
            due_date=src.due_date,
            done=False,
            done_at=None,
            position=pos,
            created_at=now,
        )
        for pos, src in enumerate(items_to_copy)
    ]
    _deactivate_all(db, current_user.uid)
    db.add(new_list)
    db.add_all(new_items)
    db.commit()
    db.expire(new_list)
    result = db.get(TodoList, new_list.id, options=[selectinload(TodoList.items)])
    return _list_to_dict(result)  # type: ignore[arg-type]


# ── POST /api/todos/lists/{id}/items ────────────────────────────────────────

@router.post("/lists/{list_id}/items", status_code=201)
def append_items(
    list_id: str,
    body: AppendItemsBody,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user),
):
    todo_list = _get_list_or_404(db, list_id, current_user.uid)
    current_count = len(todo_list.items)
    if current_count + len(body.items) > MAX_ITEMS_PER_LIST:
        raise HTTPException(
            status_code=422,
            detail=f"A list can have at most {MAX_ITEMS_PER_LIST} items. "
                   f"This list already has {current_count}.",
        )
    now = _now()
    start_pos = max((i.position for i in todo_list.items), default=-1) + 1
    new_items = [
        TodoItem(
            id=str(uuid.uuid4()),
            list_id=list_id,
            user_id=current_user.uid,
            text=it.text,
            due_date=it.due_date,
            position=start_pos + pos,
            created_at=now,
        )
        for pos, it in enumerate(body.items)
    ]
    todo_list.updated_at = now
    db.add_all(new_items)
    db.commit()
    db.expire(todo_list)
    result = db.get(TodoList, list_id, options=[selectinload(TodoList.items)])
    return _list_to_dict(result)  # type: ignore[arg-type]


# ── PATCH /api/todos/items/{id} ──────────────────────────────────────────────

@router.patch("/items/{item_id}")
def patch_item(
    item_id: str,
    body: PatchItemBody,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user),
):
    item = _get_item_or_404(db, item_id, current_user.uid)
    now = _now()
    if body.text is not None:
        item.text = body.text
    if body.done is not None:
        if body.done and not item.done:
            item.done_at = now
        elif not body.done:
            item.done_at = None
        item.done = body.done
    if body.due_date is not None:
        item.due_date = body.due_date
    # update parent list timestamp
    parent = db.get(TodoList, item.list_id)
    if parent:
        parent.updated_at = now
    db.commit()
    return _item_to_dict(item)


# ── DELETE /api/todos/items/{id} ─────────────────────────────────────────────

@router.delete("/items/{item_id}", status_code=204)
def delete_item(
    item_id: str,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user),
):
    item = _get_item_or_404(db, item_id, current_user.uid)
    parent = db.get(TodoList, item.list_id)
    db.delete(item)
    if parent:
        parent.updated_at = _now()
    db.commit()


# ── PUT /api/todos/lists/{id}/order ─────────────────────────────────────────

@router.put("/lists/{list_id}/order")
def reorder_items(
    list_id: str,
    body: OrderBody,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user),
):
    todo_list = _get_list_or_404(db, list_id, current_user.uid)
    existing_ids = {i.id for i in todo_list.items}
    submitted_ids = set(body.item_ids)
    if submitted_ids != existing_ids:
        raise HTTPException(
            status_code=422,
            detail="item_ids must contain exactly all item IDs in the list (no extras, no missing).",
        )
    id_to_item = {i.id: i for i in todo_list.items}
    for pos, item_id in enumerate(body.item_ids):
        id_to_item[item_id].position = pos
    todo_list.updated_at = _now()
    db.commit()
    db.expire(todo_list)
    result = db.get(TodoList, list_id, options=[selectinload(TodoList.items)])
    return _list_to_dict(result)  # type: ignore[arg-type]


# ── POST /api/todos/lists/{id}/clear-completed ───────────────────────────────

@router.post("/lists/{list_id}/clear-completed")
def clear_completed(
    list_id: str,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user),
):
    todo_list = _get_list_or_404(db, list_id, current_user.uid)
    for item in list(todo_list.items):
        if item.done:
            db.delete(item)
    todo_list.updated_at = _now()
    db.commit()
    db.expire(todo_list)
    result = db.get(TodoList, list_id, options=[selectinload(TodoList.items)])
    return _list_to_dict(result)  # type: ignore[arg-type]


# ── POST /api/todos/lists/{id}/toggle-all ────────────────────────────────────

@router.post("/lists/{list_id}/toggle-all")
def toggle_all(
    list_id: str,
    body: ToggleAllBody,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user),
):
    todo_list = _get_list_or_404(db, list_id, current_user.uid)
    now = _now()
    for item in todo_list.items:
        if item.done != body.done:
            item.done = body.done
            item.done_at = now if body.done else None
    todo_list.updated_at = now
    db.commit()
    db.expire(todo_list)
    result = db.get(TodoList, list_id, options=[selectinload(TodoList.items)])
    return _list_to_dict(result)  # type: ignore[arg-type]


# ── utility ──────────────────────────────────────────────────────────────────

def _weekday_label(date_str: str) -> str:
    """Return e.g. 'Monday, 12 Oct' for a YYYY-MM-DD string."""
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        return dt.strftime("%A, %-d %b")
    except Exception:
        return date_str
