export type InspectionState = "green" | "amber" | "red";

export type InspectionRatio = {
  passed: number;
  total: number;
  label?: string;
};

export type InspectionCheck = {
  id: string;
  label: string;
  weight: number;
  earned: number;
  state: InspectionState;
  detail: string;
  ratio?: InspectionRatio;
  evidenceAt?: string | null;
};

export type InspectionCategory = {
  id: string;
  title: string;
  description: string;
  score: number;
  maxScore: 100;
  state: InspectionState;
  checks: InspectionCheck[];
};

export type GeneralInspectionsSnapshot = {
  schema: 1;
  generatedAt: string;
  releaseSha: string | null;
  buildVersion: string | null;
  overallScore: number;
  overallState: InspectionState;
  categories: InspectionCategory[];
  notes: string[];
};
