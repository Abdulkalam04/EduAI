import json
from collections import defaultdict
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    ChatMessage,
    ChatSession,
    PracticeAttempt,
    PracticeEvaluation,
    PracticePaper,
    VivaSession,
)
router = APIRouter(prefix="/api", tags=["progress"])


def _relative_date(value: date, today: date) -> str:
    days = (today - value).days
    if days <= 0:
        return "Today"
    if days == 1:
        return "Yesterday"
    if days < 7:
        return f"{days} days ago"
    if days < 14:
        return "1 week ago"
    return f"{days // 7} weeks ago"


def _record_day(value: datetime | str) -> date:
    if isinstance(value, datetime):
        return value.date()
    return datetime.fromisoformat(value.replace("Z", "+00:00")).date()


def build_progress_snapshot(db: Session) -> dict[str, object]:
    today = date.today()
    attempts = db.scalars(select(PracticeAttempt)).all()
    viva_sessions = db.scalars(
        select(VivaSession).where(VivaSession.report_json.is_not(None))
    ).all()
    chat_messages = db.scalars(
        select(ChatMessage).where(ChatMessage.role == "user")
    ).all()

    topic_totals: dict[tuple[str, str], list[float]] = defaultdict(lambda: [0.0, 0.0])
    event_counts: dict[date, int] = defaultdict(int)
    study_minutes: dict[date, int] = defaultdict(int)
    score_percentages: list[float] = []
    questions_attempted = 0

    for attempt in attempts:
        paper = json.loads(attempt.paper_json)
        result = json.loads(attempt.result_json)
        result_by_id = {item["id"]: item for item in result.get("perQ", [])}
        for question in paper.get("questions", []):
            graded = result_by_id.get(question["id"])
            if graded is None:
                continue
            total = topic_totals[(attempt.subject, question.get("topic", "General"))]
            total[0] += float(graded.get("awarded", 0))
            total[1] += float(question.get("marks", 0))
            questions_attempted += 1
        event_day = _record_day(attempt.created_at)
        event_counts[event_day] += 1
        study_minutes[event_day] += max(1, round(float(result.get("timeUsedSec", 0)) / 60))
        if attempt.total:
            score_percentages.append(float(attempt.score) * 100 / attempt.total)

    for session in viva_sessions:
        report = json.loads(session.report_json or "{}")
        report_questions = report.get("questions", [])
        event_day = _record_day(session.created_at)
        if report_questions:
            event_counts[event_day] += 1
            study_minutes[event_day] += len(report_questions) * 3
        for item in report_questions:
            feedback = item.get("feedback", {})
            topic = item.get("topic", "General")
            total = topic_totals[(session.subject, topic)]
            total[0] += float(feedback.get("score", 0))
            total[1] += 1
            questions_attempted += 1
        if report.get("total"):
            score_percentages.append(
                float(report.get("score", 0)) * 100 / float(report["total"])
            )

    for message in chat_messages:
        event_day = _record_day(message.created_at)
        event_counts[event_day] += 1
        study_minutes[event_day] += 4

    mastery: dict[str, list[dict[str, object]]] = defaultdict(list)
    weak_topics: list[dict[str, object]] = []
    last_practised: dict[tuple[str, str], date] = {}
    for attempt in attempts:
        paper = json.loads(attempt.paper_json)
        event_day = _record_day(attempt.created_at)
        for question in paper.get("questions", []):
            key = (attempt.subject, question.get("topic", "General"))
            last_practised[key] = max(last_practised.get(key, event_day), event_day)
    for session in viva_sessions:
        event_day = _record_day(session.created_at)
        report = json.loads(session.report_json or "{}")
        for item in report.get("questions", []):
            key = (session.subject, item.get("topic", "General"))
            last_practised[key] = max(last_practised.get(key, event_day), event_day)

    for (subject, topic), (score, maximum) in sorted(topic_totals.items()):
        if maximum <= 0:
            continue
        value = round(score * 100 / maximum)
        mastery[subject].append({"name": topic, "value": value})
        if value < 70:
            weak_topics.append(
                {
                    "subject": subject,
                    "topic": topic,
                    "mastery": value,
                    "lastPractised": _relative_date(last_practised.get((subject, topic), today), today),
                }
            )
    for topics in mastery.values():
        topics.sort(key=lambda item: str(item["name"]).casefold())
    weak_topics.sort(key=lambda item: int(item["mastery"]))

    start = today - timedelta(days=83)
    activity = [
        {"date": (start + timedelta(days=index)).isoformat(),
         "count": event_counts.get(start + timedelta(days=index), 0)}
        for index in range(84)
    ]
    streak = 0
    cursor = today
    while event_counts.get(cursor, 0):
        streak += 1
        cursor -= timedelta(days=1)
    longest_streak = 0
    current_streak = 0
    previous_day: date | None = None
    for day in sorted(set(event_counts) | {today}):
        if event_counts[day]:
            current_streak = (
                current_streak + 1
                if previous_day is not None and day == previous_day + timedelta(days=1)
                else 1
            )
            longest_streak = max(longest_streak, current_streak)
            previous_day = day
        else:
            current_streak = 0
            previous_day = day
    # Build complete Monday-based weeks for a stable chart shape.
    monday = today - timedelta(days=today.weekday())
    weekly_minutes = []
    for offset in range(6, -1, -1):
        week_start = monday - timedelta(weeks=offset)
        minutes = sum(
            value for day, value in study_minutes.items()
            if week_start <= day < week_start + timedelta(days=7)
        )
        weekly_minutes.append(
            {"week": "This week" if offset == 0 else f"W-{offset}", "minutes": minutes}
        )

    plan: list[dict[str, object]] = []
    for index in range(7):
        if weak_topics:
            item = weak_topics[index % len(weak_topics)]
            task = f"Practise {item['topic']} with a short review"
            subject = str(item["subject"])
        else:
            subject, task = "General", "Review one topic and explain it in your own words"
        plan.append(
            {
                "day": (today + timedelta(days=index)).strftime("%a"),
                "task": task,
                "minutes": 15 if index % 2 == 0 else 20,
                "subject": subject,
            }
        )
    return {
        "mastery": dict(mastery),
        "streak": streak,
        "longestStreak": longest_streak,
        "questionsAttempted": questions_attempted,
        "averageScore": round(sum(score_percentages) / len(score_percentages)) if score_percentages else 0,
        "weeklyMinutes": weekly_minutes,
        "activity": activity,
        "weakTopics": weak_topics,
        "studyPlan": plan,
    }


@router.get("/progress")
def get_progress(db: Session = Depends(get_db)):
    return build_progress_snapshot(db)


@router.delete("/progress")
def reset_progress(db: Session = Depends(get_db)) -> dict[str, str]:
    for model in (
        ChatMessage,
        ChatSession,
        PracticeAttempt,
        PracticeEvaluation,
        PracticePaper,
        VivaSession,
    ):
        db.execute(delete(model))
    db.commit()
    return {"status": "cleared"}


@router.get("/dashboard")
def get_dashboard(db: Session = Depends(get_db)):
    progress = build_progress_snapshot(db)
    all_topics = [
        (str(topic["name"]), int(topic["value"]))
        for topics in progress["mastery"].values()
        for topic in topics
    ]
    strongest = max(all_topics, key=lambda item: item[1], default=("No topic yet", 0))[0]
    weakest = min(all_topics, key=lambda item: item[1], default=("No topic yet", 0))[0]
    today_count = progress["activity"][-1]["count"] if progress["activity"] else 0
    activity_items = []
    if progress["activity"]:
        for entry in reversed(progress["activity"]):
            if not entry["count"]:
                continue
            activity_items.append(
                {
                    "id": entry["date"],
                    "title": "Learning activity",
                    "detail": f"{entry['count']} learning actions",
                    "time": entry["date"],
                    "kind": "practice",
                }
            )
            if len(activity_items) == 5:
                break
    return {
        "stats": {
            "dailyProgress": min(100, today_count * 20),
            "streak": progress["streak"],
            "xpWeek": sum(item["minutes"] for item in progress["weeklyMinutes"]) * 10,
            "solved": progress["questionsAttempted"],
        },
        "mastery": progress["mastery"],
        "suggestion": {"strong": strongest, "weak": weakest},
        "activity": activity_items,
        "plan": [
            {
                "id": f"plan-{index + 1}",
                "title": item["task"],
                "meta": f"{item['minutes']} min · {item['subject']}",
                "done": False,
            }
            for index, item in enumerate(progress["studyPlan"][:3])
        ],
    }
