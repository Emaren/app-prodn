export type RequestBoardActor = {
  uid: string;
  displayName: string;
  isAdmin: boolean;
};

export type RequestBoardComment = {
  id: number;
  parentId: number | null;
  body: string;
  createdAt: string;
  updatedAt: string;
  author: RequestBoardActor;
  canEdit: boolean;
  canDelete: boolean;
  replies: RequestBoardComment[];
};

export type RequestBoardItem = {
  id: number;
  title: string;
  body: string;
  status: "open" | "completed";
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  author: RequestBoardActor;
  completedBy: RequestBoardActor | null;
  score: number;
  voteCount: number;
  viewerVote: -1 | 0 | 1;
  commentCount: number;
  canEdit: boolean;
  canDelete: boolean;
  canComplete: boolean;
  comments: RequestBoardComment[];
};

export type RequestBoardSnapshot = {
  viewer: RequestBoardActor | null;
  openCount: number;
  completedCount: number;
  items: RequestBoardItem[];
  completedItems: RequestBoardItem[];
};
