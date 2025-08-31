const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://bqitfhvaejxcyvjszfom.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxaXRmaHZhZWp4Y3l2anN6Zm9tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5MzkwMzMsImV4cCI6MjA2OTUxNTAzM30.BbvZctdOB8lJwiocMnt9XwzD8FHpyz5V3Y9ERvfQACA'
);

// Copiar la función actualizada del servidor
async function getActiveAgentByTrigger(trigger, sessionId = null, userId = null) {
  try {
    console.log(`🔍 Buscando agente para trigger: "${trigger}", userId: ${userId}`);
    
    // Buscar en la tabla agents usando tu estructura
    let query = supabase
      .from('agents')
      .select('*')
      .eq('is_active', true);

    // Filtrar por usuario si está disponible
    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data: agents, error } = await query;

    if (error) {
      console.error('Error query agents:', error);
      return null;
    }

    console.log(`📋 Found ${agents?.length || 0} active agents`);

    // Buscar agente que tenga el trigger en su config
    for (const agent of agents || []) {
      const config = agent.config || {};
      console.log(`\n🔍 Checking agent: ${agent.name} (${agent.id.substring(0,8)}...)`);
      
      // Buscar en triggers de automation (maneja objetos y strings)
      const triggers = config.automation?.actionTriggers || [];
      console.log(`   ActionTriggers:`, triggers);
      
      const foundByTriggers = triggers.some(t => {
        if (typeof t === 'string') {
          const match = t.toLowerCase().includes(trigger.toLowerCase());
          console.log(`   - String trigger "${t}": ${match}`);
          return match;
        } else if (t && t.keyword) {
          // Manejar formato: {type: 'contains', keyword: 'Hola', priority: 5}
          const match = t.keyword.toLowerCase().includes(trigger.toLowerCase());
          console.log(`   - Object trigger "${t.keyword}": ${match}`);
          return match;
        }
        console.log(`   - Unknown trigger format:`, t);
        return false;
      });
      
      if (foundByTriggers) {
        console.log(`✅ Found agent by actionTriggers: ${agent.name}`);
        return agent;
      }
      
      // Buscar en knowledge Q&As
      const qandas = config.knowledge?.qandas || [];
      console.log(`   Q&As:`, qandas);
      
      const foundByQA = qandas.some(qa => {
        if (qa.question) {
          const match = qa.question.toLowerCase().includes(trigger.toLowerCase());
          console.log(`   - Q&A "${qa.question}": ${match}`);
          return match;
        }
        return false;
      });
      
      if (foundByQA) {
        console.log(`✅ Found agent by knowledge Q&A: ${agent.name}`);
        return agent;
      }
      
      // Buscar por nombre del agente
      if (agent.name.toLowerCase().includes(trigger.toLowerCase())) {
        console.log(`✅ Found agent by name: ${agent.name}`);
        return agent;
      }
    }

    // Fallback: usar el primer agente activo si no encontramos match específico
    if (agents && agents.length > 0) {
      console.log(`🔄 Using fallback agent: ${agents[0].name}`);
      return agents[0];
    }
    
    return null;
  } catch (error) {
    console.error('Error obteniendo agente:', error);
    return null;
  }
}

async function testTrigger() {
  console.log('🧪 Probando trigger "hola"...\n');
  
  const agent = await getActiveAgentByTrigger('hola');
  
  if (agent) {
    console.log('\n🎉 ¡ÉXITO! Agente encontrado:');
    console.log('   ID:', agent.id);
    console.log('   Name:', agent.name);
    console.log('   Instructions:', agent.config?.persona?.instructions);
  } else {
    console.log('\n❌ No se encontró agente para "hola"');
  }
}

testTrigger();