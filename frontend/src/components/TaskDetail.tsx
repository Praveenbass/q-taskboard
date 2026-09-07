import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, getStoredUser } from "@/lib/api-client";
import type { ApiTask, ApiProjectMember, TaskStatus } from "@/types";
import { STATUS_LABELS, STATUS_ORDER } from "@/types";

type Props = {
  task: ApiTask;
  projectId: string;
  members: ApiProjectMember[];
  onClose: () => void;
};

type Comment = {
  id: string;
  author: {
    id: string;
    email: string;
    name: string;
  };
  body: string;
  created_at: string;
};

export function TaskDetail({ task, projectId, members, onClose }: Props) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [assigneeId, setAssigneeId] = useState<string>(task.assigneeId ?? "");
  const [commentBody, setCommentBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const currentUser = getStoredUser();

  const commentsQuery = useQuery({
    queryKey: ["task-comments", task.id],
    queryFn: () =>
      apiFetch<{ comments: Comment[] }>(
        `/api/tasks/${task.id}/comments`
      ),
  });

  const updateTask = useMutation({
    mutationFn: (input: Partial<ApiTask>) =>
      apiFetch<{ task: ApiTask }>(`/api/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      onClose();
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : "save failed"),
  });

  const deleteTask = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: true }>(`/api/tasks/${task.id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      onClose();
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : "delete failed"),
  });

  const addComment = useMutation({
    mutationFn: (body: string) =>
      apiFetch<{ comment: Comment }>(
        `/api/tasks/${task.id}/comments`,
        {
          method: "POST",
          body: JSON.stringify({ body }),
        }
      ),
    onSuccess: () => {
      setCommentBody("");
      queryClient.invalidateQueries({
        queryKey: ["task-comments", task.id],
      });
    },
    onError: (err) =>
      setError(
        err instanceof Error ? err.message : "failed to add comment"
      ),
  });

  function onSave() {
    setError(null);

    updateTask.mutate({
      title,
      description,
      status,
      assigneeId: assigneeId || null,
    });
  }

  function onAddComment() {
    const body = commentBody.trim();

    if (!body) return;

    setError(null);
    addComment.mutate(body);
  }

  const canComment =
    currentUser &&
    members.some(
      (member) =>
        member.user.id === currentUser.id &&
        member.role !== "viewer"
    );

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center px-4 z-50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[90vh] overflow-y-auto bg-surface border border-border rounded-lg p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">edit task</h2>

          <button
            onClick={onClose}
            className="text-muted hover:text-white"
          >
            ✕
          </button>
        </div>

        <label className="block mb-3">
          <span className="text-xs text-muted">title</span>

          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 block w-full rounded-md bg-bg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
        </label>

        <label className="block mb-3">
          <span className="text-xs text-muted">description</span>

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="mt-1 block w-full rounded-md bg-bg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
        </label>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <label className="block">
            <span className="text-xs text-muted">status</span>

            <select
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as TaskStatus)
              }
              className="mt-1 block w-full rounded-md bg-bg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none"
            >
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs text-muted">assignee</span>

            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="mt-1 block w-full rounded-md bg-bg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none"
            >
              <option value="">unassigned</option>

              {members.map((m) => (
                <option key={m.user.id} value={m.user.id}>
                  {m.user.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && (
          <p className="text-sm text-red-400 mb-3" role="alert">
            {error}
          </p>
        )}

        {/* Comments */}
        <div className="border-t border-border pt-4 mt-4">
          <h3 className="text-sm font-semibold mb-3">
            comments
          </h3>

          {commentsQuery.isLoading && (
            <p className="text-xs text-muted">
              loading comments…
            </p>
          )}

          {commentsQuery.isError && (
            <p className="text-xs text-red-400">
              failed to load comments
            </p>
          )}

          {!commentsQuery.isLoading &&
            commentsQuery.data?.comments.length === 0 && (
              <p className="text-xs text-muted mb-3">
                no comments yet.
              </p>
            )}

          <div className="space-y-3">
            {commentsQuery.data?.comments.map((comment) => (
              <div
                key={comment.id}
                className="rounded-md bg-bg border border-border p-3"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium">
                    {comment.author.name}
                  </span>

                  <span className="text-xs text-muted">
                    {new Date(
                      comment.created_at
                    ).toLocaleString()}
                  </span>
                </div>

                <p className="text-sm whitespace-pre-wrap">
                  {comment.body}
                </p>
              </div>
            ))}
          </div>

          {canComment && (
            <div className="mt-4">
              <textarea
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                placeholder="write a comment..."
                rows={3}
                className="block w-full rounded-md bg-bg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none"
              />

              <button
                onClick={onAddComment}
                disabled={
                  addComment.isPending ||
                  !commentBody.trim()
                }
                className="mt-2 text-sm px-4 py-2 rounded-md bg-accent text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {addComment.isPending
                  ? "posting…"
                  : "add comment"}
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 mt-5">
          <button
            onClick={() => deleteTask.mutate()}
            disabled={deleteTask.isPending}
            className="text-sm text-red-400 hover:text-red-300"
          >
            delete task
          </button>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="text-sm px-4 py-2 rounded-md border border-border hover:border-muted"
            >
              cancel
            </button>

            <button
              onClick={onSave}
              disabled={updateTask.isPending}
              className="text-sm px-4 py-2 rounded-md bg-accent text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {updateTask.isPending ? "saving…" : "save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}