const { createClient } = require('@supabase/supabase-js');

// Pega os dados das variáveis de ambiente
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;

// Cria o cliente de conexão do Supabase
const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = { supabase };