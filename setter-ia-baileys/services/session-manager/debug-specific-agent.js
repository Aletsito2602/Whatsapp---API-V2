const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://bqitfhvaejxcyvjszfom.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxaXRmaHZhZWp4Y3l2anN6Zm9tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5MzkwMzMsImV4cCI6MjA2OTUxNTAzM30.BbvZctdOB8lJwiocMnt9XwzD8FHpyz5V3Y9ERvfQACA'
);

async function debugSpecificAgent() {
  console.log('🔍 Debuggeando agente específico: 193c8e5d-a0d8-4b72-a3b2-ead268f8f035\n');
  
  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .eq('id', '193c8e5d-a0d8-4b72-a3b2-ead268f8f035')
    .single();
  
  if (error) {
    console.error('❌ Error:', error);
    return;
  }
  
  if (!data) {
    console.log('❌ Agente no encontrado');
    return;
  }
  
  console.log('🤖 AGENTE ENCONTRADO:');
  console.log('   ID:', data.id);
  console.log('   Name:', data.name);
  console.log('   Description:', data.description);
  console.log('   Active:', data.is_active);
  console.log('   Created:', data.created_at);
  console.log('');
  
  console.log('📋 CONFIGURACIÓN COMPLETA:');
  console.log(JSON.stringify(data.config, null, 2));
  console.log('');
  
  // Analizar triggers
  if (data.config && data.config.automation) {
    console.log('🎯 TRIGGERS ENCONTRADOS:');
    const actionTriggers = data.config.automation.actionTriggers || [];
    console.log('   ActionTriggers:', actionTriggers);
    
    if (data.config.knowledge && data.config.knowledge.qandas) {
      console.log('   Q&As:');
      data.config.knowledge.qandas.forEach((qa, i) => {
        console.log(`     ${i+1}. Q: "${qa.question}" -> A: "${qa.answer}"`);
      });
    }
  }
  
  // Analizar instrucciones
  if (data.config && data.config.persona && data.config.persona.instructions) {
    console.log('');
    console.log('📝 INSTRUCCIONES:');
    console.log(data.config.persona.instructions);
  }
}

debugSpecificAgent();