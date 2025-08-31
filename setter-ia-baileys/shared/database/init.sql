-- Setter IA Baileys Database Schema
-- PostgreSQL 12+ required for gen_random_uuid()

-- Create database if it doesn't exist (run manually)
-- CREATE DATABASE setter_baileys;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    api_key VARCHAR(255) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    profile JSONB DEFAULT '{}',
    subscription JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- WhatsApp sessions table
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    session_name VARCHAR(255) NOT NULL,
    phone_number VARCHAR(20),
    status VARCHAR(50) DEFAULT 'disconnected',
    auth_state JSONB,
    webhook_url VARCHAR(500),
    last_seen TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, session_name)
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES whatsapp_sessions(id) ON DELETE CASCADE,
    message_id VARCHAR(255),
    direction VARCHAR(20) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    from_number VARCHAR(20) NOT NULL,
    to_number VARCHAR(20) NOT NULL,
    message_type VARCHAR(50) NOT NULL,
    content JSONB NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    timestamp TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Webhooks table
CREATE TABLE IF NOT EXISTS webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    session_id UUID REFERENCES whatsapp_sessions(id) ON DELETE CASCADE,
    url VARCHAR(500) NOT NULL,
    secret VARCHAR(255),
    events TEXT[] NOT NULL,
    is_active BOOLEAN DEFAULT true,
    retry_attempts INTEGER DEFAULT 3,
    timeout INTEGER DEFAULT 30000,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Webhook delivery attempts table
CREATE TABLE IF NOT EXISTS webhook_delivery_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id UUID REFERENCES webhooks(id) ON DELETE CASCADE,
    payload JSONB NOT NULL,
    url VARCHAR(500) NOT NULL,
    attempt INTEGER NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('pending', 'success', 'failed', 'retrying')),
    http_status INTEGER,
    error TEXT,
    response_time INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);

-- Media files table
CREATE TABLE IF NOT EXISTS media_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES whatsapp_sessions(id) ON DELETE CASCADE,
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    original_name VARCHAR(255),
    mime_type VARCHAR(100) NOT NULL,
    file_size BIGINT,
    storage_path VARCHAR(500) NOT NULL,
    storage_type VARCHAR(50) DEFAULT 'local',
    url VARCHAR(500),
    thumbnail_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT NOW()
);

-- User API keys table (for multiple keys per user)
CREATE TABLE IF NOT EXISTS user_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    api_key VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    permissions TEXT[] DEFAULT ARRAY[]::TEXT[],
    is_active BOOLEAN DEFAULT true,
    expires_at TIMESTAMP,
    last_used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Usage statistics table
CREATE TABLE IF NOT EXISTS usage_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    session_id UUID REFERENCES whatsapp_sessions(id) ON DELETE CASCADE,
    stat_date DATE NOT NULL,
    messages_sent INTEGER DEFAULT 0,
    messages_received INTEGER DEFAULT 0,
    api_calls INTEGER DEFAULT 0,
    webhook_calls INTEGER DEFAULT 0,
    storage_used BIGINT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, session_id, stat_date)
);

-- Contacts table
CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES whatsapp_sessions(id) ON DELETE CASCADE,
    phone_number VARCHAR(20) NOT NULL,
    display_name VARCHAR(255),
    profile_picture_url VARCHAR(500),
    is_business BOOLEAN DEFAULT false,
    is_group BOOLEAN DEFAULT false,
    group_metadata JSONB,
    last_seen TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(session_id, phone_number)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_api_key ON users(api_key);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON whatsapp_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_status ON whatsapp_sessions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON whatsapp_sessions(status);
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_session_timestamp ON messages(session_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_messages_message_id ON messages(message_id);
CREATE INDEX IF NOT EXISTS idx_messages_direction ON messages(direction);
CREATE INDEX IF NOT EXISTS idx_webhooks_user_id ON webhooks(user_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_session_id ON webhooks(session_id);
CREATE INDEX IF NOT EXISTS idx_webhook_attempts_webhook_id ON webhook_delivery_attempts(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_attempts_status ON webhook_delivery_attempts(status, created_at);
CREATE INDEX IF NOT EXISTS idx_media_files_session_id ON media_files(session_id);
CREATE INDEX IF NOT EXISTS idx_media_files_message_id ON media_files(message_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON user_api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key ON user_api_keys(api_key);
CREATE INDEX IF NOT EXISTS idx_usage_stats_user_date ON usage_stats(user_id, stat_date);
CREATE INDEX IF NOT EXISTS idx_usage_stats_session_date ON usage_stats(session_id, stat_date);
CREATE INDEX IF NOT EXISTS idx_contacts_session_id ON contacts(session_id);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone_number);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers to relevant tables
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_sessions_updated_at ON whatsapp_sessions;
CREATE TRIGGER update_sessions_updated_at 
    BEFORE UPDATE ON whatsapp_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_webhooks_updated_at ON webhooks;
CREATE TRIGGER update_webhooks_updated_at 
    BEFORE UPDATE ON webhooks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_api_keys_updated_at ON user_api_keys;
CREATE TRIGGER update_api_keys_updated_at 
    BEFORE UPDATE ON user_api_keys
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_usage_stats_updated_at ON usage_stats;
CREATE TRIGGER update_usage_stats_updated_at 
    BEFORE UPDATE ON usage_stats
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_contacts_updated_at ON contacts;
CREATE TRIGGER update_contacts_updated_at 
    BEFORE UPDATE ON contacts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert sample data for testing (optional)
DO $$ 
BEGIN
    -- Insert a test user
    IF NOT EXISTS (SELECT 1 FROM users WHERE email = 'test@example.com') THEN
        INSERT INTO users (email, api_key, profile, subscription) VALUES (
            'test@example.com',
            'test-api-key-12345',
            '{"firstName": "Test", "lastName": "User", "company": "Test Corp"}',
            '{"plan": "free", "status": "active", "monthlyMessageQuota": 1000, "currentMonthUsage": 0}'
        );
    END IF;
    
    -- Insert a test API key
    IF NOT EXISTS (SELECT 1 FROM user_api_keys WHERE api_key = 'test-api-key-12345') THEN
        INSERT INTO user_api_keys (user_id, api_key, name, permissions) 
        SELECT id, 'test-api-key-12345', 'Test API Key', ARRAY['sessions:create', 'sessions:read', 'messages:send', 'messages:read']
        FROM users WHERE email = 'test@example.com';
    END IF;
END $$;

-- Grant permissions (adjust as needed for your setup)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO setter_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO setter_user;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO setter_user;