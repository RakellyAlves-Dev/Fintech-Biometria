require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Limpa barras do final e espaços da URL e da Chave do Supabase
const supabaseUrl = (process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
const supabaseKey = (process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ ERRO: SUPABASE_URL ou SUPABASE_KEY não foram configuradas corretamente!');
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = { supabase };
