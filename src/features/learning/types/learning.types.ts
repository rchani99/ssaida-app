import type { Database } from '@/lib/supabase/database.types';

export type Child = Database['public']['Tables']['children']['Row'];
export type StudyItem = Database['public']['Tables']['study_items']['Row'];
export type DailyPlan = Database['public']['Tables']['daily_plans']['Row'];
export type DailyTask = Database['public']['Tables']['daily_tasks']['Row'];
export type ChildCollectible = Database['public']['Tables']['child_collectibles']['Row'];

export type DailyTaskWithPlan = DailyTask & {
  daily_plans: Pick<DailyPlan, 'child_id' | 'plan_date'>;
  is_superseded?: boolean;
};

export type CollectibleWithCatalog = ChildCollectible & {
  collectible_catalog: { name: string };
};

export type CreateStudyItemInput = {
  childId: string;
  itemType: 'WORKBOOK' | 'ACTIVITY';
  name: string;
  subject: 'KOREAN' | 'MATH' | 'ENGLISH' | 'SCIENCE' | 'SOCIAL' | 'OTHER' | null;
  estimatedMinutes: number;
  studyWeekdays: number[];
  workbookPagesPerSession?: number;
  workbookLastPage?: number;
  workbookNextStartPage?: number;
};

export type ConfirmationInput = {
  dailyTaskId: string;
  status: 'PARENT_CONFIRMED' | 'PARTIAL' | 'RETRY';
  actualEndPage: number | null;
};

export type ManualTaskInput = {
  childId: string;
  planDate: string;
  itemType: 'WORKBOOK' | 'ACTIVITY';
  name: string;
  subject: CreateStudyItemInput['subject'];
  minutes: number;
  startPage: number | null;
  endPage: number | null;
};

export type QuantityResolution = {
  task_id: string;
  context_token: string;
  kind: 'GAP' | 'ALIGNED' | 'PARTIAL_OVERLAP' | 'FULL_OVERLAP';
  action: 'ADJUST' | 'EXCLUDE';
  confirmed_progress: number;
  old_start: number;
  old_end: number;
  new_start: number;
  new_end: number;
};
