/**
 * TypeScript types for Turbo Quizz App
 * Database models and action data structures
 */

// ============================================
// DATABASE MODELS
// ============================================

export interface Quiz {
  id: number;
  shop: string;
  quiz_id: string;
  title: string;
  description: string | null;
  status: QuizStatus;
  display_on_pages: string[];
  theme_settings: ThemeSettings | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  questions?: Question[];
  quiz_sessions?: QuizSession[];
}

export type QuizStatus = "draft" | "active" | "inactive";

export interface ThemeSettings {
  primaryColor?: string;
  secondaryColor?: string;
  fontFamily?: string;
  buttonStyle?: "rounded" | "square" | "pill";
  [key: string]: any; // Allow additional custom settings
}

export interface Question {
  id: number;
  quiz_id: string;
  question_id: string;
  question_text: string;
  order: number;
  created_at: Date;
  updated_at: Date;
  quiz?: Quiz;
  answers?: Answer[];
}

export interface Answer {
  id: number;
  question_id: string;
  answer_id: string;
  answer_text: string;
  order: number;
  action_type: ActionType;
  action_data: ActionData;
  created_at: Date;
  updated_at: Date;
  question?: Question;
  answer_selections?: AnswerSelection[];
}

export type ActionType = "show_text" | "show_products" | "show_collections";

export interface QuizSession {
  id: number;
  session_id: string;
  quiz_id: string;
  shop: string;
  started_at: Date;
  completed_at: Date | null;
  is_completed: boolean;
  customer_id: string | null;
  page_url: string | null;
  user_agent: string | null;
  quiz?: Quiz;
  answer_selections?: AnswerSelection[];
}

export interface AnswerSelection {
  id: number;
  session_id: string;
  answer_id: string;
  question_id: string;
  quiz_id: string;
  shop: string;
  selected_at: Date;
  session?: QuizSession;
  answer?: Answer;
}

export interface QuizAnalyticsSummary {
  id: number;
  quiz_id: string;
  shop: string;
  date: Date;
  impressions: number;
  starts: number;
  completions: number;
  created_at: Date;
  updated_at: Date;
}

// ============================================
// ACTION DATA STRUCTURES
// ============================================

export type ActionData = ShowTextAction | ShowProductsAction | ShowCollectionsAction;

export interface ShowTextAction {
  type: "show_text";
  text: string;
  html?: string;
  styling?: {
    backgroundColor?: string;
    textColor?: string;
    fontSize?: string;
    padding?: string;
  };
}

export interface ShowProductsAction {
  type: "show_products";
  product_ids: string[]; // Shopify GID format: "gid://shopify/Product/123"
  display_style?: "grid" | "list" | "carousel";
  columns?: number;
  show_prices?: boolean;
  show_add_to_cart?: boolean;
}

export interface ShowCollectionsAction {
  type: "show_collections";
  collection_ids: string[]; // Shopify GID format: "gid://shopify/Collection/789"
  display_style?: "grid" | "list" | "carousel";
  products_per_collection?: number;
  show_collection_title?: boolean;
}

// ============================================
// API REQUEST/RESPONSE TYPES
// ============================================

export interface CreateQuizRequest {
  title: string;
  description?: string;
  status?: QuizStatus;
  display_on_pages?: string[];
  theme_settings?: ThemeSettings;
}

export interface CreateQuestionRequest {
  quiz_id: string;
  question_text: string;
  order: number;
}

export interface CreateAnswerRequest {
  question_id: string;
  answer_text: string;
  order: number;
  action_type: ActionType;
  action_data: ActionData;
}

export interface StartQuizSessionRequest {
  quiz_id: string;
  customer_id?: string;
  page_url?: string;
  user_agent?: string;
}

export interface RecordAnswerSelectionRequest {
  session_id: string;
  answer_id: string;
  question_id: string;
  quiz_id: string;
}

export interface CompleteQuizSessionRequest {
  session_id: string;
}

// ============================================
// ANALYTICS TYPES
// ============================================

export interface QuizAnalytics {
  quiz_id: string;
  total_impressions: number;
  total_starts: number;
  total_completions: number;
  completion_rate: number;
  average_completion_time?: number; // in seconds
  most_popular_answers: {
    question_id: string;
    question_text: string;
    answers: {
      answer_id: string;
      answer_text: string;
      selection_count: number;
      selection_percentage: number;
    }[];
  }[];
}

export interface QuizPerformanceMetrics {
  date: string;
  impressions: number;
  starts: number;
  completions: number;
  completion_rate: number;
}

// ============================================
// FRONTEND TYPES
// ============================================

export interface QuizWidgetConfig {
  quiz_id: string;
  theme_settings?: ThemeSettings;
  show_progress_bar?: boolean;
  enable_animations?: boolean;
}

export interface QuizWidgetState {
  currentQuestionIndex: number;
  answers: Record<string, string>; // question_id -> answer_id
  isComplete: boolean;
  sessionId: string | null;
}

// ============================================
// UTILITY TYPES
// ============================================

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
