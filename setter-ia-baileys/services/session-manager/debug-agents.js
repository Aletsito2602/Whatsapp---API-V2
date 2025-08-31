const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://bqitfhvaejxcyvjszfom.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxaXRmaHZhZWp4Y3l2anN6Zm9tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5MzkwMzMsImV4cCI6MjA2OTUxNTAzM30.BbvZctdOB8lJwiocMnt9XwzD8FHpyz5V3Y9ERvfQACA'
);

async function debugAgents() {
  console.log('🔍 Debuggeando agentes...\n');
  
  const { data, error } = await supabase.from('agents').select('*');
  
  if (error) {
    console.error('❌ Error:', error);
    return;
  }
  
  console.log(`📊 Total agentes: ${data.length}\n`);
  
  // Filtrar activos
  const activeAgents = data.filter(agent => agent.is_active);
  console.log(`✅ Agentes activos: ${activeAgents.length}\n`);
  
  // Buscar agente con "hola"
  let holaFound = false;
  
  for (const agent of data) {
    if (!agent.config || !agent.config.automation) continue;
    
    const triggers = agent.config.automation.actionTriggers || [];
    const qandas = agent.config.knowledge?.qandas || [];
    
    // Buscar "hola" en triggers
    const hasHolaTrigger = triggers.some(t => t.toLowerCase().includes('hola'));
    const hasHolaQA = qandas.some(qa => qa.question && qa.question.toLowerCase().includes('hola'));
    
    if (hasHolaTrigger || hasHolaQA) {
      console.log('🎯 AGENTE CON "HOLA" ENCONTRADO:');
      console.log('   ID:', agent.id);
      console.log('   Name:', agent.name);
      console.log('   Active:', agent.is_active);
      console.log('   ActionTriggers:', triggers);
      console.log('   Q&As con hola:', qandas.filter(qa => qa.question && qa.question.toLowerCase().includes('hola')));
      console.log('   Instructions:', agent.config.persona?.instructions?.substring(0, 100) + '...');
      console.log('');
      holaFound = true;
    }
  }
  
  if (!holaFound) {
    console.log('❌ NO se encontró ningún agente con trigger "hola"\n');
    
    console.log('📋 Primeros 5 agentes activos:');
    activeAgents.slice(0, 5).forEach(agent => {
      const triggers = agent.config?.automation?.actionTriggers || [];
      console.log(`   - ${agent.name} (${agent.id.substring(0,8)}...)`);
      console.log(`     Active: ${agent.is_active}`);
      console.log(`     Triggers: ${JSON.stringify(triggers)}`);
      console.log('');
    });
  }
}

debugAgents();