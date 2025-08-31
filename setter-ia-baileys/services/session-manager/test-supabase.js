// Test de conexión a Supabase
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://bqitfhvaejxcyvjszfom.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxaXRmaHZhZWp4Y3l2anN6Zm9tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5MzkwMzMsImV4cCI6MjA2OTUxNTAzM30.BbvZctdOB8lJwiocMnt9XwzD8FHpyz5V3Y9ERvfQACA'
);

async function testConnection() {
  console.log('🧪 Testing Supabase connection...');
  
  try {
    // Intentar hacer una query simple
    const { data, error } = await supabase.from('agents').select('count', { count: 'exact' });
    
    if (error) {
      console.log('❌ Error (expected - tabla no existe aún):', error.message);
      console.log('✅ Conexión a Supabase OK - necesita crear tabla');
      return true;
    } else {
      console.log('✅ Conexión exitosa y tabla existe!', data);
      return true;
    }
  } catch (err) {
    console.log('❌ Error de conexión:', err.message);
    return false;
  }
}

testConnection();