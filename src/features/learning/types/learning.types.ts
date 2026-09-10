import type { Database } from '@/lib/supabase/database.types';

export type Child = Database['public']['Tables']['children']['Row'];
export type StudyItem = Database['public']['Tables']['study_items']['Row'];
export type DailyPlan = Database['public']['Tables']['daily_plans']['Row'];
export type DailyTask = Database['public']['Tables']['daily_tasks']['Row'];
export type ChildCollectible = Database['public']['Tables']['child_collectibles']['Row'];

export type DailyTaskWithPlan = DailyTask & {
  daily_plans: Pick<DailyPlan, 'child_id' | 'plan_date'>;
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
};

export type ConfirmationInput = {
  dailyTaskId: string;
  status: 'PARENT_CONFIRMED';
  actualEndPage: number | null;
};
