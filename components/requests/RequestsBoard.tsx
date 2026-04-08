"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";

import SteamLoginButton from "@/components/SteamLoginButton";
import { useUserAuth } from "@/context/UserAuthContext";
import type { RequestBoardComment, RequestBoardItem, RequestBoardSnapshot } from "@/lib/requestBoardTypes";

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

async function requestBoardSnapshot() {
  const response = await fetch("/api/requests", { cache: "no-store" });
  const payload = (await response.json().catch(() => ({}))) as
    | RequestBoardSnapshot
    | { detail?: string };

  if (!response.ok) {
    throw new Error(typeof payload === "object" && payload && "detail" in payload && typeof payload.detail === "string" ? payload.detail : "Request board failed.");
  }

  return payload as RequestBoardSnapshot;
}

type RequestCardProps = {
  item: RequestBoardItem;
  canInteract: boolean;
  sending: boolean;
  editingRequestId: number | null;
  editingCommentId: number | null;
  requestDrafts: Record<number, { title: string; body: string }>;
  commentDrafts: Record<string, string>;
  replyTargetId: number | null;
  onVote: (requestId: number, value: -1 | 0 | 1) => void;
  onDeleteRequest: (requestId: number) => void;
  onDeleteComment: (commentId: number) => void;
  onSetReplyTarget: (commentId: number | null) => void;
  onCommentDraftChange: (key: string, value: string) => void;
  onSubmitComment: (requestId: number, body: string, parentId?: number | null) => void;
  onStartEditRequest: (item: RequestBoardItem) => void;
  onCancelEditRequest: (requestId: number) => void;
  onRequestDraftChange: (requestId: number, field: "title" | "body", value: string) => void;
  onSaveRequest: (requestId: number) => void;
  onToggleComplete: (requestId: number, nextStatus: "open" | "completed") => void;
  onStartEditComment: (comment: RequestBoardComment) => void;
  onCancelEditComment: (commentId: number) => void;
  onSaveComment: (commentId: number) => void;
};

function CommentCard({
  requestId,
  comment,
  canInteract,
  depth,
  sending,
  editingCommentId,
  commentDrafts,
  replyTargetId,
  onDeleteComment,
  onSetReplyTarget,
  onCommentDraftChange,
  onSubmitComment,
  onStartEditComment,
  onCancelEditComment,
  onSaveComment,
}: {
  requestId: number;
  comment: RequestBoardComment;
  canInteract: boolean;
  depth: 0 | 1;
  sending: boolean;
  editingCommentId: number | null;
  commentDrafts: Record<string, string>;
  replyTargetId: number | null;
  onDeleteComment: (commentId: number) => void;
  onSetReplyTarget: (commentId: number | null) => void;
  onCommentDraftChange: (key: string, value: string) => void;
  onSubmitComment: (requestId: number, body: string, parentId?: number | null) => void;
  onStartEditComment: (comment: RequestBoardComment) => void;
  onCancelEditComment: (commentId: number) => void;
  onSaveComment: (commentId: number) => void;
}) {
  const replyKey = `reply:${comment.id}`;
  const editKey = `edit-comment:${comment.id}`;
  const isEditing = editingCommentId === comment.id;
  const isReplying = replyTargetId === comment.id;
  const cardTone =
    depth === 0
      ? "border-white/10 bg-white/[0.04]"
      : "border-white/7 bg-slate-950/45";

  return (
    <div className={`rounded-[1.3rem] border px-4 py-3 ${cardTone}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-medium text-white">{comment.author.displayName}</div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.24em] text-slate-500">
            {formatTimestamp(comment.createdAt)}
          </div>
        </div>
        <div className="flex w-full flex-wrap gap-2 text-xs text-slate-400 sm:w-auto sm:justify-end">
          {canInteract ? (
            <button
              type="button"
              onClick={() => onSetReplyTarget(isReplying ? null : comment.id)}
              className="rounded-full border border-white/10 px-2.5 py-1 transition hover:border-white/20 hover:text-white"
            >
              Reply
            </button>
          ) : null}
          {comment.canEdit ? (
            <button
              type="button"
              onClick={() => (isEditing ? onCancelEditComment(comment.id) : onStartEditComment(comment))}
              className="rounded-full border border-white/10 px-2.5 py-1 transition hover:border-white/20 hover:text-white"
            >
              {isEditing ? "Cancel" : "Edit"}
            </button>
          ) : null}
          {comment.canDelete ? (
            <button
              type="button"
              onClick={() => onDeleteComment(comment.id)}
              className="rounded-full border border-red-400/25 px-2.5 py-1 text-red-200 transition hover:bg-red-500/10"
            >
              Delete
            </button>
          ) : null}
        </div>
      </div>

      {isEditing ? (
        <div className="mt-3 space-y-3">
          <textarea
            value={commentDrafts[editKey] ?? ""}
            onChange={(event) => onCommentDraftChange(editKey, event.target.value)}
            className="min-h-[5rem] w-full resize-none rounded-2xl border border-white/10 bg-slate-950/55 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-amber-300/35"
          />
          <div className="flex justify-start sm:justify-end">
            <button
              type="button"
              onClick={() => onSaveComment(comment.id)}
              disabled={sending || !(commentDrafts[editKey] || "").trim()}
              className="rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-200">{comment.body}</div>
      )}

      {comment.replies.length > 0 ? (
        <div className="mt-4 space-y-3 pl-4 sm:pl-6">
          {comment.replies.map((reply) => (
            <CommentCard
              key={reply.id}
              requestId={requestId}
              comment={reply}
              canInteract={canInteract}
              depth={1}
              sending={sending}
              editingCommentId={editingCommentId}
              commentDrafts={commentDrafts}
              replyTargetId={replyTargetId}
              onDeleteComment={onDeleteComment}
              onSetReplyTarget={onSetReplyTarget}
              onCommentDraftChange={onCommentDraftChange}
              onSubmitComment={onSubmitComment}
              onStartEditComment={onStartEditComment}
              onCancelEditComment={onCancelEditComment}
              onSaveComment={onSaveComment}
            />
          ))}
        </div>
      ) : null}

      {isReplying ? (
        <div className="mt-4 space-y-3">
          <textarea
            value={commentDrafts[replyKey] ?? ""}
            onChange={(event) => onCommentDraftChange(replyKey, event.target.value)}
            placeholder={`Reply to ${comment.author.displayName}...`}
            className="min-h-[4.5rem] w-full resize-none rounded-2xl border border-white/10 bg-slate-950/55 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-amber-300/35"
          />
          <div className="flex justify-start gap-2 sm:justify-end">
            <button
              type="button"
              onClick={() => onSetReplyTarget(null)}
              className="rounded-full border border-white/12 px-4 py-2 text-sm text-white/80 transition hover:border-white/25 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onSubmitComment(requestId, commentDrafts[replyKey] || "", comment.id)}
              disabled={sending || !(commentDrafts[replyKey] || "").trim()}
              className="rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Reply
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RequestCard(props: RequestCardProps) {
  const {
    item,
    canInteract,
    sending,
    editingRequestId,
    editingCommentId,
    requestDrafts,
    commentDrafts,
    replyTargetId,
    onVote,
    onDeleteRequest,
    onDeleteComment,
    onSetReplyTarget,
    onCommentDraftChange,
    onSubmitComment,
    onStartEditRequest,
    onCancelEditRequest,
    onRequestDraftChange,
    onSaveRequest,
    onToggleComplete,
    onStartEditComment,
    onCancelEditComment,
    onSaveComment,
  } = props;

  const isEditing = editingRequestId === item.id;
  const requestDraft = requestDrafts[item.id] ?? { title: item.title, body: item.body };
  const commentKey = `request:${item.id}`;

  return (
    <article className="overflow-hidden rounded-[1.7rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-3.5 shadow-[0_18px_60px_rgba(0,0,0,0.28)] sm:p-5">
      <div className="grid gap-4 lg:grid-cols-[5.5rem_minmax(0,1fr)]">
        <div className="flex items-center gap-2 self-start lg:flex-col lg:items-stretch">
          <button
            type="button"
            onClick={() => onVote(item.id, item.viewerVote === 1 ? 0 : 1)}
            disabled={!canInteract}
            className={`rounded-2xl border px-3 py-2 text-sm font-semibold transition ${
              item.viewerVote === 1
                ? "border-emerald-400/35 bg-emerald-500/12 text-emerald-100"
                : "border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:text-white"
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            ▲
          </button>
          <div
            className="min-w-[2.75rem] rounded-2xl border border-white/10 bg-slate-950/45 px-3 py-3 text-center"
            aria-label={`Votes ${item.score}`}
          >
            <div className="text-xl font-semibold text-white tabular-nums">{item.score}</div>
          </div>
          <button
            type="button"
            onClick={() => onVote(item.id, item.viewerVote === -1 ? 0 : -1)}
            disabled={!canInteract}
            className={`rounded-2xl border px-3 py-2 text-sm font-semibold transition ${
              item.viewerVote === -1
                ? "border-red-400/35 bg-red-500/12 text-red-100"
                : "border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:text-white"
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            ▼
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
                  {item.author.displayName}
                </div>
                <div className="text-[11px] uppercase tracking-[0.3em] text-slate-600">
                  {formatTimestamp(item.createdAt)}
                </div>
                {item.status === "completed" ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.24em] text-emerald-100">
                    <span>Completed</span>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex w-full flex-wrap items-center gap-2 text-xs sm:w-auto sm:justify-end">
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-slate-300 sm:px-3 sm:py-1.5">
                {item.commentCount} comments
              </span>
              {item.canEdit ? (
                <button
                  type="button"
                  onClick={() => (isEditing ? onCancelEditRequest(item.id) : onStartEditRequest(item))}
                  className="rounded-full border border-white/10 px-2.5 py-1 text-slate-300 transition hover:border-white/20 hover:text-white sm:px-3 sm:py-1.5"
                >
                  {isEditing ? "Cancel" : "Edit"}
                </button>
              ) : null}
              {isEditing ? (
                <button
                  type="button"
                  onClick={() => onSaveRequest(item.id)}
                  disabled={sending || !requestDraft.title.trim() || !requestDraft.body.trim()}
                  className="rounded-full bg-amber-300 px-2.5 py-1 font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50 sm:px-3 sm:py-1.5"
                >
                  Save
                </button>
              ) : null}
              {item.canComplete ? (
                <button
                  type="button"
                  onClick={() => onToggleComplete(item.id, item.status === "completed" ? "open" : "completed")}
                  className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 px-2.5 py-1 text-emerald-100 transition hover:bg-emerald-500/10 sm:px-3 sm:py-1.5"
                >
                  {item.status === "completed" ? (
                    "Reopen"
                  ) : (
                    <>
                      <span>Complete</span>
                      <CheckCircle2 className="h-4 w-4" />
                    </>
                  )}
                </button>
              ) : null}
              {item.canDelete ? (
                <button
                  type="button"
                  onClick={() => onDeleteRequest(item.id)}
                  className="rounded-full border border-red-400/25 px-2.5 py-1 text-red-200 transition hover:bg-red-500/10 sm:px-3 sm:py-1.5"
                >
                  Delete
                </button>
              ) : null}
            </div>
          </div>

          {isEditing ? (
            <div className="space-y-3">
              <input
                value={requestDraft.title}
                onChange={(event) => onRequestDraftChange(item.id, "title", event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/55 px-4 py-3 text-lg font-semibold text-white outline-none placeholder:text-slate-500 focus:border-amber-300/35"
              />
              <textarea
                value={requestDraft.body}
                onChange={(event) => onRequestDraftChange(item.id, "body", event.target.value)}
                className="min-h-[7rem] w-full resize-none rounded-2xl border border-white/10 bg-slate-950/55 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-500 focus:border-amber-300/35"
              />
            </div>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-white sm:text-2xl">{item.title}</h2>
              <p className="whitespace-pre-wrap text-sm leading-7 text-slate-300">{item.body}</p>
            </>
          )}

          {item.completedAt ? (
            <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/[0.08] px-4 py-3 text-sm text-emerald-100/90">
              Marked completed {formatTimestamp(item.completedAt)}
              {item.completedBy ? ` by ${item.completedBy.displayName}` : ""}.
            </div>
          ) : null}

          <div className="space-y-3">
            {item.comments.map((comment) => (
              <CommentCard
                key={comment.id}
                requestId={item.id}
                comment={comment}
                canInteract={canInteract}
                depth={0}
                sending={sending}
                editingCommentId={editingCommentId}
                commentDrafts={commentDrafts}
                replyTargetId={replyTargetId}
                onDeleteComment={onDeleteComment}
                onSetReplyTarget={onSetReplyTarget}
                onCommentDraftChange={onCommentDraftChange}
                onSubmitComment={onSubmitComment}
                onStartEditComment={onStartEditComment}
                onCancelEditComment={onCancelEditComment}
                onSaveComment={onSaveComment}
              />
            ))}
          </div>

          <div className="rounded-[1.35rem] border border-white/10 bg-slate-950/45 p-4">
            <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">Add Comment</div>
            <textarea
              value={commentDrafts[commentKey] ?? ""}
              onChange={(event) => onCommentDraftChange(commentKey, event.target.value)}
              placeholder={canInteract ? "Comment on this request..." : "Sign in to comment..."}
              disabled={!canInteract}
              className="mt-3 min-h-[5rem] w-full resize-none rounded-2xl border border-white/10 bg-slate-950/55 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-amber-300/35"
            />
            <div className="mt-3 flex justify-start sm:justify-end">
              <button
                type="button"
                onClick={() => onSubmitComment(item.id, commentDrafts[commentKey] || "", null)}
                disabled={!canInteract || sending || !(commentDrafts[commentKey] || "").trim()}
                className="rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Comment
              </button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function RequestsBoard() {
  const { uid, loading: authLoading } = useUserAuth();
  const [snapshot, setSnapshot] = useState<RequestBoardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [requestDrafts, setRequestDrafts] = useState<Record<number, { title: string; body: string }>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [editingRequestId, setEditingRequestId] = useState<number | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [replyTargetId, setReplyTargetId] = useState<number | null>(null);
  const [expandedCompletedIds, setExpandedCompletedIds] = useState<number[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const payload = await requestBoardSnapshot();
        if (!cancelled) {
          setSnapshot(payload);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "Request board failed.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    if (!authLoading) {
      void load();
    }

    return () => {
      cancelled = true;
    };
  }, [authLoading, uid]);

  const viewerReady = Boolean(snapshot?.viewer);
  const emptyOpen = (snapshot?.items.length ?? 0) === 0;

  async function mutate(method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>) {
    setSending(true);
    setError(null);
    try {
      const response = await fetch("/api/requests", {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as
        | RequestBoardSnapshot
        | { detail?: string };

      if (!response.ok) {
        throw new Error(typeof payload === "object" && payload && "detail" in payload && typeof payload.detail === "string" ? payload.detail : "Request action failed.");
      }

      setSnapshot(payload as RequestBoardSnapshot);
      setEditingRequestId(null);
      setEditingCommentId(null);
      setReplyTargetId(null);
      return payload as RequestBoardSnapshot;
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Request action failed.");
      return null;
    } finally {
      setSending(false);
    }
  }

  const statusCopy = useMemo(() => {
    if (!snapshot) return "Loading requests...";
    return `${snapshot.openCount} open · ${snapshot.completedCount} completed`;
  }, [snapshot]);

  return (
    <div className="space-y-5 overflow-x-hidden">
      <section className="rounded-[1.75rem] border border-white/10 bg-[linear-gradient(135deg,rgba(251,191,36,0.08),rgba(15,23,42,0.86)_38%,rgba(2,6,23,0.96))] p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.36em] text-amber-200/70">Requests</div>
            <h1 className="mt-2 text-3xl font-semibold text-white sm:text-4xl">Vote what matters up.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
              Type the request once. Let the board rank it. Build the highest signal first.
            </p>
          </div>
          <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200">
            {statusCopy}
          </div>
        </div>
      </section>

      <section className="rounded-[1.7rem] border border-white/10 bg-slate-950/80 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-[11px] uppercase tracking-[0.3em] text-slate-500">New Request</div>
          {snapshot?.viewer ? (
            <div className="text-sm text-slate-300">Posting as {snapshot.viewer.displayName}</div>
          ) : null}
        </div>

        {viewerReady ? (
          <div className="mt-4 space-y-4">
            <input
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              placeholder="Short title"
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base font-semibold text-white outline-none placeholder:text-slate-500 focus:border-amber-300/35"
            />
            <textarea
              value={newBody}
              onChange={(event) => setNewBody(event.target.value)}
              placeholder="What should change, and why?"
              className="min-h-[8rem] w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-500 focus:border-amber-300/35"
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={async () => {
                  const payload = await mutate("POST", {
                    kind: "request",
                    title: newTitle,
                    body: newBody,
                  });
                  if (payload) {
                    setNewTitle("");
                    setNewBody("");
                  }
                }}
                disabled={sending || !newTitle.trim() || !newBody.trim()}
                className="rounded-full bg-amber-300 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Submit Request
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
            <div className="text-sm leading-6 text-slate-300">
              Sign in with Steam to submit requests, vote, comment, and reply.
            </div>
            <SteamLoginButton className="rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200" />
          </div>
        )}
      </section>

      {error ? (
        <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      <section className="space-y-4">
        {loading ? (
          <div className="rounded-[1.7rem] border border-white/10 bg-slate-950/70 px-5 py-8 text-slate-300">
            Loading request board...
          </div>
        ) : emptyOpen ? (
          <div className="rounded-[1.7rem] border border-white/10 bg-slate-950/70 px-5 py-8 text-slate-300">
            No open requests yet. The next sharp idea can start here.
          </div>
        ) : (
          snapshot?.items.map((item) => (
            <RequestCard
              key={item.id}
              item={item}
              canInteract={viewerReady}
              sending={sending}
              editingRequestId={editingRequestId}
              editingCommentId={editingCommentId}
              requestDrafts={requestDrafts}
              commentDrafts={commentDrafts}
              replyTargetId={replyTargetId}
              onVote={(requestId, value) => {
                if (!viewerReady) return;
                void mutate("PATCH", {
                  action: "vote",
                  requestId,
                  value,
                });
              }}
              onDeleteRequest={(requestId) => {
                void mutate("DELETE", { requestId });
              }}
              onDeleteComment={(commentId) => {
                void mutate("DELETE", { commentId });
              }}
              onSetReplyTarget={setReplyTargetId}
              onCommentDraftChange={(key, value) => {
                setCommentDrafts((current) => ({
                  ...current,
                  [key]: value,
                }));
              }}
              onSubmitComment={(requestId, body, parentId) => {
                if (!viewerReady) return;
                const draftKey = parentId ? `reply:${parentId}` : `request:${requestId}`;
                void mutate("POST", {
                  kind: "comment",
                  requestId,
                  parentId,
                  body,
                }).then((payload) => {
                  if (payload) {
                    setCommentDrafts((current) => ({
                      ...current,
                      [draftKey]: "",
                    }));
                  }
                });
              }}
              onStartEditRequest={(request) => {
                setEditingRequestId(request.id);
                setRequestDrafts((current) => ({
                  ...current,
                  [request.id]: {
                    title: request.title,
                    body: request.body,
                  },
                }));
              }}
              onCancelEditRequest={(requestId) => {
                setEditingRequestId(null);
                setRequestDrafts((current) => {
                  const next = { ...current };
                  delete next[requestId];
                  return next;
                });
              }}
              onRequestDraftChange={(requestId, field, value) => {
                setRequestDrafts((current) => ({
                  ...current,
                  [requestId]: {
                    title: current[requestId]?.title ?? item.title,
                    body: current[requestId]?.body ?? item.body,
                    [field]: value,
                  },
                }));
              }}
              onSaveRequest={(requestId) => {
                const draft = requestDrafts[requestId];
                if (!draft) return;
                void mutate("PATCH", {
                  action: "edit_request",
                  requestId,
                  title: draft.title,
                  body: draft.body,
                });
              }}
              onToggleComplete={(requestId, nextStatus) => {
                void mutate("PATCH", {
                  action: "set_status",
                  requestId,
                  status: nextStatus,
                });
              }}
              onStartEditComment={(comment) => {
                setEditingCommentId(comment.id);
                setCommentDrafts((current) => ({
                  ...current,
                  [`edit-comment:${comment.id}`]: comment.body,
                }));
              }}
              onCancelEditComment={(commentId) => {
                setEditingCommentId(null);
                setCommentDrafts((current) => {
                  const next = { ...current };
                  delete next[`edit-comment:${commentId}`];
                  return next;
                });
              }}
              onSaveComment={(commentId) => {
                void mutate("PATCH", {
                  action: "edit_comment",
                  commentId,
                  body: commentDrafts[`edit-comment:${commentId}`] || "",
                });
              }}
            />
          ))
        )}
      </section>

      {snapshot?.completedItems.length ? (
        <section className="rounded-[1.7rem] border border-white/10 bg-slate-950/70 p-5 sm:p-6">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] text-slate-500">
            <span>Completed</span>
            <CheckCircle2 className="h-5 w-5 text-emerald-300" />
          </div>
          <div className="mt-4 space-y-3">
            {snapshot.completedItems.map((item) => (
              <div
                key={item.id}
                className="rounded-[1.3rem] border border-white/10 bg-white/[0.04] px-4 py-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedCompletedIds((current) =>
                        current.includes(item.id)
                          ? current.filter((value) => value !== item.id)
                          : [...current, item.id]
                      )
                    }
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="text-base font-semibold text-white">{item.title}</div>
                    <div className="mt-1 text-sm text-slate-400">
                      {item.score} votes · Completed {item.completedAt ? formatTimestamp(item.completedAt) : "recently"}
                      {item.completedBy ? ` by ${item.completedBy.displayName}` : ""}
                    </div>
                  </button>
                  {item.canComplete ? (
                    <button
                      type="button"
                      onClick={() => {
                        void mutate("PATCH", {
                          action: "set_status",
                          requestId: item.id,
                          status: "open",
                        });
                      }}
                      className="rounded-full border border-white/12 px-3 py-1.5 text-sm text-white/80 transition hover:border-white/25 hover:text-white"
                    >
                      Reopen
                    </button>
                  ) : null}
                </div>
                {expandedCompletedIds.includes(item.id) ? (
                  <div className="mt-4 rounded-2xl border border-white/8 bg-slate-950/45 px-4 py-4 text-sm leading-6 text-slate-300">
                    {item.body}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
