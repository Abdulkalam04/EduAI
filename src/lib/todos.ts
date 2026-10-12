import { useContext } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  activateTodoList,
  appendTodoItems,
  clearCompletedTodoItems,
  copyTodoList,
  createTodoList,
  deleteTodoItem,
  deleteTodoList,
  getActiveTodoList,
  getTodoLists,
  patchTodoItem,
  patchTodoList,
  reorderTodoItems,
  toggleAllTodoItems,
} from "./api";
import type {
  CopyTodoListInput,
  CreateTodoListInput,
  PatchTodoItemInput,
  PatchTodoListInput,
  TodoItem,
  TodoItemInput,
  TodoList,
  TodoListSummary,
} from "./types";

import { AuthContext } from "./auth";

export const todoKeys = {
  all: (userId: string) => ["todos", userId] as const,
  active: (userId: string) => ["todos", userId, "active"] as const,
  lists: (userId: string, status?: string) => ["todos", userId, "lists", status ?? "all"] as const,
};

/**
 * Returns the active user ID or "local" when not signed in or outside AuthProvider.
 */
export function useCurrentUserId(): string {
  const auth = useContext(AuthContext);
  if (auth?.user?.id) return auth.user.id;
  if (typeof window !== "undefined") {
    const lastUid = window.localStorage.getItem("eduai-last-uid");
    if (lastUid) return lastUid;
  }
  return "local";
}

// ── Queries ─────────────────────────────────────────────────────────────────

export function useActiveTodoList(customUserId?: string) {
  const currentUserId = useCurrentUserId();
  const userId = customUserId ?? currentUserId;
  return useQuery<TodoList | null>({
    queryKey: todoKeys.active(userId),
    queryFn: ({ signal }) => getActiveTodoList(signal),
  });
}

export function useTodoLists(
  status: "unfinished" | "all" = "unfinished",
  limit = 30,
  customUserId?: string,
) {
  const currentUserId = useCurrentUserId();
  const userId = customUserId ?? currentUserId;
  return useQuery<TodoListSummary[]>({
    queryKey: todoKeys.lists(userId, status),
    queryFn: ({ signal }) => getTodoLists({ status, limit }, signal),
  });
}

// ── Mutations with Optimistic Updates & Rollback ────────────────────────────

export function useCreateTodoList(customUserId?: string) {
  const currentUserId = useCurrentUserId();
  const userId = customUserId ?? currentUserId;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateTodoListInput) => createTodoList(input),
    onSuccess: (data) => {
      queryClient.setQueryData(todoKeys.active(userId), data);
    },
    onError: (err, variables, _context) => {
      toast.error(err instanceof Error ? err.message : "Failed to create to-do list.", {
        action: {
          label: "Retry",
          onClick: () => {
            void queryClient
              .getMutationCache()
              .build(queryClient, {
                mutationFn: () => createTodoList(variables),
              })
              .execute(variables);
          },
        },
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: todoKeys.all(userId) });
    },
  });
}

export function useActivateTodoList(customUserId?: string) {
  const currentUserId = useCurrentUserId();
  const userId = customUserId ?? currentUserId;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, plan_date }: { id: string; plan_date?: string }) =>
      activateTodoList(id, plan_date ? { plan_date } : undefined),
    onSuccess: (data) => {
      queryClient.setQueryData(todoKeys.active(userId), data);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to activate list.");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: todoKeys.all(userId) });
    },
  });
}

export function useCopyTodoList(customUserId?: string) {
  const currentUserId = useCurrentUserId();
  const userId = customUserId ?? currentUserId;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CopyTodoListInput }) =>
      copyTodoList(id, input),
    onSuccess: (data) => {
      queryClient.setQueryData(todoKeys.active(userId), data);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to copy list.");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: todoKeys.all(userId) });
    },
  });
}

export function usePatchTodoList(customUserId?: string) {
  const currentUserId = useCurrentUserId();
  const userId = customUserId ?? currentUserId;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PatchTodoListInput }) =>
      patchTodoList(id, input),
    onMutate: async ({ id, input }) => {
      await queryClient.cancelQueries({ queryKey: todoKeys.active(userId) });
      const previous = queryClient.getQueryData<TodoList | null>(todoKeys.active(userId));
      if (previous && previous.id === id) {
        queryClient.setQueryData<TodoList>(todoKeys.active(userId), {
          ...previous,
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.plan_date !== undefined ? { plan_date: input.plan_date } : {}),
        });
      }
      return { previous };
    },
    onError: (err, variables, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(todoKeys.active(userId), context.previous);
      }
      toast.error(err instanceof Error ? err.message : "Failed to update list.", {
        action: {
          label: "Retry",
          onClick: () => {
            void patchTodoList(variables.id, variables.input);
          },
        },
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: todoKeys.all(userId) });
    },
  });
}

export function useDeleteTodoList(customUserId?: string) {
  const currentUserId = useCurrentUserId();
  const userId = customUserId ?? currentUserId;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteTodoList(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: todoKeys.active(userId) });
      const previous = queryClient.getQueryData<TodoList | null>(todoKeys.active(userId));
      if (previous && previous.id === id) {
        queryClient.setQueryData<TodoList | null>(todoKeys.active(userId), null);
      }
      return { previous };
    },
    onError: (err, _id, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(todoKeys.active(userId), context.previous);
      }
      toast.error(err instanceof Error ? err.message : "Failed to delete list.");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: todoKeys.all(userId) });
    },
  });
}

export function useToggleTodoItem(customUserId?: string) {
  const currentUserId = useCurrentUserId();
  const userId = customUserId ?? currentUserId;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => patchTodoItem(id, { done }),
    onMutate: async ({ id, done }) => {
      await queryClient.cancelQueries({ queryKey: todoKeys.active(userId) });
      const previous = queryClient.getQueryData<TodoList | null>(todoKeys.active(userId));
      if (previous) {
        const nextItems = previous.items.map((item) =>
          item.id === id
            ? {
                ...item,
                done,
                done_at: done ? new Date().toISOString() : null,
              }
            : item,
        );
        const nextDone = nextItems.filter((i) => i.done).length;
        queryClient.setQueryData<TodoList>(todoKeys.active(userId), {
          ...previous,
          items: nextItems,
          done: nextDone,
        });
      }
      return { previous };
    },
    onError: (err, variables, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(todoKeys.active(userId), context.previous);
      }
      toast.error(err instanceof Error ? err.message : "Failed to update item.", {
        action: {
          label: "Retry",
          onClick: () => {
            void patchTodoItem(variables.id, { done: variables.done });
          },
        },
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: todoKeys.all(userId) });
    },
  });
}

export function useEditTodoItem(customUserId?: string) {
  const currentUserId = useCurrentUserId();
  const userId = customUserId ?? currentUserId;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PatchTodoItemInput }) =>
      patchTodoItem(id, input),
    onMutate: async ({ id, input }) => {
      await queryClient.cancelQueries({ queryKey: todoKeys.active(userId) });
      const previous = queryClient.getQueryData<TodoList | null>(todoKeys.active(userId));
      if (previous) {
        const nextItems = previous.items.map((item) =>
          item.id === id ? { ...item, ...input } : item,
        );
        queryClient.setQueryData<TodoList>(todoKeys.active(userId), {
          ...previous,
          items: nextItems,
        });
      }
      return { previous };
    },
    onError: (err, variables, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(todoKeys.active(userId), context.previous);
      }
      toast.error(err instanceof Error ? err.message : "Failed to edit item.", {
        action: {
          label: "Retry",
          onClick: () => {
            void patchTodoItem(variables.id, variables.input);
          },
        },
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: todoKeys.all(userId) });
    },
  });
}

export function useAddTodoItems(customUserId?: string) {
  const currentUserId = useCurrentUserId();
  const userId = customUserId ?? currentUserId;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ listId, items }: { listId: string; items: TodoItemInput[] }) =>
      appendTodoItems(listId, items),
    onMutate: async ({ listId, items }) => {
      await queryClient.cancelQueries({ queryKey: todoKeys.active(userId) });
      const previous = queryClient.getQueryData<TodoList | null>(todoKeys.active(userId));
      if (previous && previous.id === listId) {
        const tempItems: TodoItem[] = items.map((it, idx) => ({
          id: `temp-${Date.now()}-${idx}`,
          list_id: listId,
          user_id: userId,
          text: it.text,
          done: false,
          done_at: null,
          due_date: it.due_date ?? null,
          position: previous.items.length + idx,
          created_at: new Date().toISOString(),
        }));
        queryClient.setQueryData<TodoList>(todoKeys.active(userId), {
          ...previous,
          items: [...previous.items, ...tempItems],
          total: previous.total + tempItems.length,
        });
      }
      return { previous };
    },
    onError: (err, variables, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(todoKeys.active(userId), context.previous);
      }
      toast.error(err instanceof Error ? err.message : "Failed to add items.", {
        action: {
          label: "Retry",
          onClick: () => {
            void appendTodoItems(variables.listId, variables.items);
          },
        },
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: todoKeys.all(userId) });
    },
  });
}

export function useDeleteTodoItem(customUserId?: string) {
  const currentUserId = useCurrentUserId();
  const userId = customUserId ?? currentUserId;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteTodoItem(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: todoKeys.active(userId) });
      const previous = queryClient.getQueryData<TodoList | null>(todoKeys.active(userId));
      if (previous) {
        const itemToDelete = previous.items.find((i) => i.id === id);
        const nextItems = previous.items.filter((i) => i.id !== id);
        queryClient.setQueryData<TodoList>(todoKeys.active(userId), {
          ...previous,
          items: nextItems,
          total: Math.max(0, previous.total - 1),
          done: itemToDelete?.done ? Math.max(0, previous.done - 1) : previous.done,
        });
        return { previous, itemToDelete };
      }
      return { previous };
    },
    onError: (err, _id, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(todoKeys.active(userId), context.previous);
      }
      toast.error(err instanceof Error ? err.message : "Failed to delete item.");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: todoKeys.all(userId) });
    },
  });
}

export function useReorderTodoItems(customUserId?: string) {
  const currentUserId = useCurrentUserId();
  const userId = customUserId ?? currentUserId;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ listId, itemIds }: { listId: string; itemIds: string[] }) =>
      reorderTodoItems(listId, itemIds),
    onMutate: async ({ listId, itemIds }) => {
      await queryClient.cancelQueries({ queryKey: todoKeys.active(userId) });
      const previous = queryClient.getQueryData<TodoList | null>(todoKeys.active(userId));
      if (previous && previous.id === listId) {
        const map = new Map(previous.items.map((i) => [i.id, i]));
        const reordered = itemIds
          .map((id, index) => {
            const item = map.get(id);
            return item ? { ...item, position: index } : null;
          })
          .filter((i): i is TodoItem => i !== null);
        queryClient.setQueryData<TodoList>(todoKeys.active(userId), {
          ...previous,
          items: reordered,
        });
      }
      return { previous };
    },
    onError: (err, variables, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(todoKeys.active(userId), context.previous);
      }
      toast.error(err instanceof Error ? err.message : "Failed to reorder items.", {
        action: {
          label: "Retry",
          onClick: () => {
            void reorderTodoItems(variables.listId, variables.itemIds);
          },
        },
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: todoKeys.all(userId) });
    },
  });
}

export function useClearCompletedTodoItems(customUserId?: string) {
  const currentUserId = useCurrentUserId();
  const userId = customUserId ?? currentUserId;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (listId: string) => clearCompletedTodoItems(listId),
    onMutate: async (listId) => {
      await queryClient.cancelQueries({ queryKey: todoKeys.active(userId) });
      const previous = queryClient.getQueryData<TodoList | null>(todoKeys.active(userId));
      if (previous && previous.id === listId) {
        const remaining = previous.items.filter((i) => !i.done);
        queryClient.setQueryData<TodoList>(todoKeys.active(userId), {
          ...previous,
          items: remaining,
          total: remaining.length,
          done: 0,
        });
      }
      return { previous };
    },
    onError: (err, variables, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(todoKeys.active(userId), context.previous);
      }
      toast.error(err instanceof Error ? err.message : "Failed to clear completed items.", {
        action: {
          label: "Retry",
          onClick: () => {
            void clearCompletedTodoItems(variables);
          },
        },
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: todoKeys.all(userId) });
    },
  });
}

export function useToggleAllTodoItems(customUserId?: string) {
  const currentUserId = useCurrentUserId();
  const userId = customUserId ?? currentUserId;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ listId, done }: { listId: string; done: boolean }) =>
      toggleAllTodoItems(listId, done),
    onMutate: async ({ listId, done }) => {
      await queryClient.cancelQueries({ queryKey: todoKeys.active(userId) });
      const previous = queryClient.getQueryData<TodoList | null>(todoKeys.active(userId));
      if (previous && previous.id === listId) {
        const updated = previous.items.map((i) => ({
          ...i,
          done,
          done_at: done ? new Date().toISOString() : null,
        }));
        queryClient.setQueryData<TodoList>(todoKeys.active(userId), {
          ...previous,
          items: updated,
          done: done ? updated.length : 0,
        });
      }
      return { previous };
    },
    onError: (err, variables, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(todoKeys.active(userId), context.previous);
      }
      toast.error(err instanceof Error ? err.message : "Failed to toggle all items.", {
        action: {
          label: "Retry",
          onClick: () => {
            void toggleAllTodoItems(variables.listId, variables.done);
          },
        },
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: todoKeys.all(userId) });
    },
  });
}
