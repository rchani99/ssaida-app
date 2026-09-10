export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      child_collectibles: {
        Row: {
          child_id: string;
          collectible_catalog_id: string;
          completed_at: string | null;
          created_at: string;
          growth_goal_snapshot: number;
          id: string;
          progress_points: number;
          revealed_at: string | null;
          sequence_no: number;
          started_at: string;
          status: string;
          theme_code: string;
          updated_at: string;
        };
        Insert: {
          child_id: string;
          collectible_catalog_id: string;
          completed_at?: string | null;
          created_at?: string;
          growth_goal_snapshot: number;
          id?: string;
          progress_points?: number;
          revealed_at?: string | null;
          sequence_no: number;
          started_at?: string;
          status?: string;
          theme_code: string;
          updated_at?: string;
        };
        Update: {
          child_id?: string;
          collectible_catalog_id?: string;
          completed_at?: string | null;
          created_at?: string;
          growth_goal_snapshot?: number;
          id?: string;
          progress_points?: number;
          revealed_at?: string | null;
          sequence_no?: number;
          started_at?: string;
          status?: string;
          theme_code?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'child_collectibles_catalog_theme_fkey';
            columns: ['collectible_catalog_id', 'theme_code'];
            isOneToOne: false;
            referencedRelation: 'collectible_catalog';
            referencedColumns: ['id', 'theme_code'];
          },
          {
            foreignKeyName: 'child_collectibles_child_id_fkey';
            columns: ['child_id'];
            isOneToOne: false;
            referencedRelation: 'children';
            referencedColumns: ['id'];
          },
        ];
      };
      children: {
        Row: {
          created_at: string;
          daily_target_minutes: number;
          id: string;
          name: string;
          parent_id: string;
          pending_growth_points: number;
          rest_weekdays: number[];
          selected_collection_theme_code: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          daily_target_minutes?: number;
          id?: string;
          name: string;
          parent_id: string;
          pending_growth_points?: number;
          rest_weekdays?: number[];
          selected_collection_theme_code?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          daily_target_minutes?: number;
          id?: string;
          name?: string;
          parent_id?: string;
          pending_growth_points?: number;
          rest_weekdays?: number[];
          selected_collection_theme_code?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'children_parent_id_fkey';
            columns: ['parent_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      collectible_catalog: {
        Row: {
          code: string;
          created_at: string;
          growth_goal: number;
          id: string;
          is_active: boolean;
          name: string;
          sort_order: number;
          theme_code: string;
          updated_at: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          growth_goal?: number;
          id?: string;
          is_active?: boolean;
          name: string;
          sort_order: number;
          theme_code: string;
          updated_at?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          growth_goal?: number;
          id?: string;
          is_active?: boolean;
          name?: string;
          sort_order?: number;
          theme_code?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      collectible_growth_events: {
        Row: {
          child_collectible_id: string;
          created_at: string;
          daily_task_id: string | null;
          growth_points: number;
          id: string;
          source_type: string;
        };
        Insert: {
          child_collectible_id: string;
          created_at?: string;
          daily_task_id?: string | null;
          growth_points: number;
          id?: string;
          source_type: string;
        };
        Update: {
          child_collectible_id?: string;
          created_at?: string;
          daily_task_id?: string | null;
          growth_points?: number;
          id?: string;
          source_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'collectible_growth_events_child_collectible_id_fkey';
            columns: ['child_collectible_id'];
            isOneToOne: false;
            referencedRelation: 'child_collectibles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'collectible_growth_events_daily_task_id_fkey';
            columns: ['daily_task_id'];
            isOneToOne: false;
            referencedRelation: 'daily_tasks';
            referencedColumns: ['id'];
          },
        ];
      };
      daily_plans: {
        Row: {
          child_id: string;
          created_at: string;
          day_type: string;
          id: string;
          plan_date: string;
          target_minutes_snapshot: number;
          updated_at: string;
        };
        Insert: {
          child_id: string;
          created_at?: string;
          day_type?: string;
          id?: string;
          plan_date: string;
          target_minutes_snapshot: number;
          updated_at?: string;
        };
        Update: {
          child_id?: string;
          created_at?: string;
          day_type?: string;
          id?: string;
          plan_date?: string;
          target_minutes_snapshot?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'daily_plans_child_id_fkey';
            columns: ['child_id'];
            isOneToOne: false;
            referencedRelation: 'children';
            referencedColumns: ['id'];
          },
        ];
      };
      daily_tasks: {
        Row: {
          actual_end_page: number | null;
          child_completed_at: string | null;
          created_at: string;
          daily_plan_id: string;
          growth_weight: number;
          id: string;
          item_type: string;
          name_snapshot: string;
          parent_verified_at: string | null;
          planned_end_page: number | null;
          planned_minutes: number;
          planned_start_page: number | null;
          reward_collection_theme_code: string | null;
          sort_order: number;
          source_daily_task_id: string | null;
          source_type: string;
          started_at: string | null;
          status: string;
          study_item_id: string | null;
          subject_snapshot: string | null;
          updated_at: string;
          verification_attempt_count: number;
        };
        Insert: {
          actual_end_page?: number | null;
          child_completed_at?: string | null;
          created_at?: string;
          daily_plan_id: string;
          growth_weight?: number;
          id?: string;
          item_type: string;
          name_snapshot: string;
          parent_verified_at?: string | null;
          planned_end_page?: number | null;
          planned_minutes: number;
          planned_start_page?: number | null;
          reward_collection_theme_code?: string | null;
          sort_order: number;
          source_daily_task_id?: string | null;
          source_type: string;
          started_at?: string | null;
          status?: string;
          study_item_id?: string | null;
          subject_snapshot?: string | null;
          updated_at?: string;
          verification_attempt_count?: number;
        };
        Update: {
          actual_end_page?: number | null;
          child_completed_at?: string | null;
          created_at?: string;
          daily_plan_id?: string;
          growth_weight?: number;
          id?: string;
          item_type?: string;
          name_snapshot?: string;
          parent_verified_at?: string | null;
          planned_end_page?: number | null;
          planned_minutes?: number;
          planned_start_page?: number | null;
          reward_collection_theme_code?: string | null;
          sort_order?: number;
          source_daily_task_id?: string | null;
          source_type?: string;
          started_at?: string | null;
          status?: string;
          study_item_id?: string | null;
          subject_snapshot?: string | null;
          updated_at?: string;
          verification_attempt_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'daily_tasks_daily_plan_id_fkey';
            columns: ['daily_plan_id'];
            isOneToOne: false;
            referencedRelation: 'daily_plans';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'daily_tasks_source_daily_task_id_fkey';
            columns: ['source_daily_task_id'];
            isOneToOne: false;
            referencedRelation: 'daily_tasks';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'daily_tasks_study_item_id_fkey';
            columns: ['study_item_id'];
            isOneToOne: false;
            referencedRelation: 'study_items';
            referencedColumns: ['id'];
          },
        ];
      };
      parent_pin_credentials: {
        Row: {
          created_at: string;
          failed_attempts: number;
          locked_until: string | null;
          parent_id: string;
          pin_hash: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          failed_attempts?: number;
          locked_until?: string | null;
          parent_id: string;
          pin_hash: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          failed_attempts?: number;
          locked_until?: string | null;
          parent_id?: string;
          pin_hash?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'parent_pin_credentials_parent_id_fkey';
            columns: ['parent_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          auth_user_id: string;
          created_at: string;
          id: string;
          onboarding_completed: boolean;
          updated_at: string;
        };
        Insert: {
          auth_user_id: string;
          created_at?: string;
          id?: string;
          onboarding_completed?: boolean;
          updated_at?: string;
        };
        Update: {
          auth_user_id?: string;
          created_at?: string;
          id?: string;
          onboarding_completed?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      study_items: {
        Row: {
          child_id: string;
          created_at: string;
          deleted_at: string | null;
          estimated_minutes: number;
          id: string;
          item_type: string;
          name: string;
          status: string;
          study_weekdays: number[];
          subject: string | null;
          updated_at: string;
          workbook_last_completed_page: number | null;
          workbook_last_page: number | null;
          workbook_pages_per_session: number | null;
        };
        Insert: {
          child_id: string;
          created_at?: string;
          deleted_at?: string | null;
          estimated_minutes: number;
          id?: string;
          item_type: string;
          name: string;
          status?: string;
          study_weekdays: number[];
          subject?: string | null;
          updated_at?: string;
          workbook_last_completed_page?: number | null;
          workbook_last_page?: number | null;
          workbook_pages_per_session?: number | null;
        };
        Update: {
          child_id?: string;
          created_at?: string;
          deleted_at?: string | null;
          estimated_minutes?: number;
          id?: string;
          item_type?: string;
          name?: string;
          status?: string;
          study_weekdays?: number[];
          subject?: string | null;
          updated_at?: string;
          workbook_last_completed_page?: number | null;
          workbook_last_page?: number | null;
          workbook_pages_per_session?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'study_items_child_id_fkey';
            columns: ['child_id'];
            isOneToOne: false;
            referencedRelation: 'children';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      add_manual_daily_task: {
        Args: {
          manual_item_type: string;
          manual_name: string;
          manual_planned_end_page: number;
          manual_planned_minutes: number;
          manual_planned_start_page: number;
          manual_subject: string;
          target_child_id: string;
          target_plan_date: string;
        };
        Returns: string;
      };
      complete_daily_task: {
        Args: { target_daily_task_id: string };
        Returns: undefined;
      };
      complete_parent_onboarding: {
        Args: { child_name: string; parent_pin: string; target_minutes: number };
        Returns: undefined;
      };
      confirm_daily_tasks: {
        Args: { task_confirmations: Json };
        Returns: undefined;
      };
      ensure_daily_plan: {
        Args: { target_child_id: string; target_plan_date: string };
        Returns: string;
      };
      reschedule_manual_task: {
        Args: { source_daily_task_id: string; target_plan_date: string };
        Returns: string;
      };
      reveal_collectible: {
        Args: { target_child_collectible_id: string };
        Returns: undefined;
      };
      select_collection_theme: {
        Args: { target_theme_code: string };
        Returns: undefined;
      };
      skip_manual_task: {
        Args: { target_daily_task_id: string };
        Returns: undefined;
      };
      start_daily_task: {
        Args: { target_daily_task_id: string };
        Returns: undefined;
      };
      undo_daily_task_completion: {
        Args: { target_daily_task_id: string };
        Returns: undefined;
      };
      verify_parent_pin: { Args: { parent_pin: string }; Returns: boolean };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
