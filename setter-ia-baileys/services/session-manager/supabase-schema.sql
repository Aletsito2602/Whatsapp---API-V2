-- Tabla de agentes para WhatsApp con prompts y triggers personalizados
-- Ejecutar en el SQL Editor de Supabase

CREATE TABLE IF NOT EXISTS agentes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Información del agente
  nombre VARCHAR(100) NOT NULL,
  descripcion TEXT,
  
  -- Trigger y prompt
  action_trigger VARCHAR(50) NOT NULL, -- palabra que activa el agente
  prompt TEXT NOT NULL, -- prompt para Gemini AI
  
  -- Configuración
  is_active BOOLEAN DEFAULT true,
  session_id VARCHAR(100), -- vinculado a una sesión específica (opcional)
  user_id VARCHAR(100), -- para multi-tenant
  
  -- Estadísticas
  total_activations INTEGER DEFAULT 0,
  last_activation TIMESTAMP WITH TIME ZONE,
  
  -- Configuración avanzada
  config JSONB DEFAULT '{}'::jsonb -- configuraciones adicionales
);

-- Índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_agentes_trigger ON agentes(action_trigger);
CREATE INDEX IF NOT EXISTS idx_agentes_session ON agentes(session_id);
CREATE INDEX IF NOT EXISTS idx_agentes_user ON agentes(user_id);
CREATE INDEX IF NOT EXISTS idx_agentes_active ON agentes(is_active);

-- Función para actualizar timestamp automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger para auto-actualizar updated_at
CREATE TRIGGER update_agentes_updated_at 
    BEFORE UPDATE ON agentes 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- RLS (Row Level Security) para multi-tenant
ALTER TABLE agentes ENABLE ROW LEVEL SECURITY;

-- Política: usuarios solo pueden ver/modificar sus propios agentes
CREATE POLICY "Users can manage their own agents" ON agentes
  FOR ALL USING (auth.uid()::text = user_id);

-- Datos de ejemplo
INSERT INTO agentes (nombre, descripcion, action_trigger, prompt, user_id) VALUES 
(
  'Asistente de Soporte',
  'Agente especializado en atención al cliente',
  'soporte',
  'Eres un asistente de soporte técnico especializado. Responde de manera profesional y útil. Siempre pregunta cómo puedes ayudar más. Termina con un emoji de soporte 🛠️',
  'demo-user-1'
),
(
  'Bot de Ventas',
  'Agente enfocado en convertir leads en ventas',
  'comprar',
  'Eres un experto en ventas. Tu objetivo es ayudar al cliente a encontrar la mejor solución para sus necesidades. Sé persuasivo pero amigable. Siempre incluye una llamada a la acción. Termina con 💰',
  'demo-user-1'
),
(
  'Asistente Personal',
  'Agente general para tareas cotidianas',
  'setter',
  'Eres Setter, un asistente personal inteligente. Ayudas con información general, recordatorios, y tareas cotidianas. Sé conciso pero informativo. Termina con ⚡',
  'demo-user-1'
);

COMMENT ON TABLE agentes IS 'Tabla de agentes de WhatsApp con prompts y triggers personalizados';
COMMENT ON COLUMN agentes.action_trigger IS 'Palabra clave que activa este agente';
COMMENT ON COLUMN agentes.prompt IS 'Prompt específico para Gemini AI cuando se activa este agente';
COMMENT ON COLUMN agentes.config IS 'Configuraciones adicionales en formato JSON';