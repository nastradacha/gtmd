// lib/types.ts - Shared TypeScript types for GTMD

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  html_url: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  labels: Array<{
    id: number;
    name: string;
    color: string;
  }>;
  assignees: Array<{
    login: string;
    avatar_url: string;
  }>;
  milestone: {
    title: string;
    number: number;
  } | null;
  user: {
    login: string;
    avatar_url: string;
  };
}

export interface TestCase {
  path: string;
  name: string;
  url: string;
  content?: string;
  sha?: string;
  storyId?: string;
  priority?: string;
  suite?: string;
  // If the file is coming from an open PR branch, mark as pending review
  pending?: boolean;
  // Git reference/branch to fetch this file from (for pending review files)
  ref?: string;
  // Optional PR context for pending files
  prNumber?: number;
  prUrl?: string;
}

export interface TestCaseFormData {
  title: string;
  storyId: string;
  steps: string;
  expected: string;
  priority: "P1" | "P2" | "P3";
  suite: string;
  folder?: string;
}

export interface DefectFormData {
  title: string;
  description: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  priority: "P1" | "P2" | "P3";
  storyId?: string;
  testCaseId?: string;
}

export interface CoverageReport {
  totalStories: number;
  linkedStories: number;
  coveragePercent: number;
  unlinkedStories: GitHubIssue[];
}

export interface DefectTrend {
  date: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface GitHubUser {
  login: string;
  name: string;
  email: string;
  avatar_url: string;
}

export interface GitHubRateLimit {
  limit: number;
  remaining: number;
  reset: number;
  used: number;
}
