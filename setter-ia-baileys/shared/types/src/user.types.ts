export interface User {
  id: string;
  email: string;
  apiKey: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  profile?: UserProfile;
  subscription?: UserSubscription;
}

export interface UserProfile {
  firstName?: string;
  lastName?: string;
  company?: string;
  phone?: string;
  timezone?: string;
}

export interface UserSubscription {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  monthlyMessageQuota: number;
  currentMonthUsage: number;
  subscriptionStart: Date;
  subscriptionEnd?: Date;
}

export enum SubscriptionPlan {
  FREE = 'free',
  STARTER = 'starter',
  PROFESSIONAL = 'professional',
  ENTERPRISE = 'enterprise'
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  EXPIRED = 'expired'
}

export interface CreateUserRequest {
  email: string;
  profile?: Partial<UserProfile>;
}

export interface UpdateUserRequest {
  email?: string;
  isActive?: boolean;
  profile?: Partial<UserProfile>;
}

export interface ApiKeyResponse {
  apiKey: string;
  createdAt: Date;
  expiresAt?: Date;
}

export interface UserUsageStats {
  userId: string;
  currentMonth: {
    messagesSent: number;
    messagesReceived: number;
    activeSessions: number;
  };
  lastMonth: {
    messagesSent: number;
    messagesReceived: number;
    averageSessions: number;
  };
  quota: {
    limit: number;
    used: number;
    remaining: number;
  };
}