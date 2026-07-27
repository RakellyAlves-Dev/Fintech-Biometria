require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { supabase } = require('./db');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');

const app = express();
app.use(cors());
app.use(express.json());

// Servir os arquivos estáticos da pasta public
app.use(express.static(path.join(__dirname, 'public')));

// Trata e limpa as variáveis de ambiente automaticamente
const rawRpId = process.env.RP_ID || 'localhost';
const rawOrigin = process.env.ORIGIN || `http://localhost:${process.env.PORT || 3000}`;

// RP_ID não pode ter protocolo (http/https) nem barra no final
const RP_ID = rawRpId.replace(/^https?:\/\//, '').split('/')[0].split(':')[0].trim();

// ORIGIN precisa ter o protocolo e NÃO pode ter barra no final
const ORIGIN = rawOrigin.replace(/\/$/, '').trim();

// ==========================================
// 1. ROTA: Gerar opções para Cadastro Biométrico
// ==========================================
app.post('/api/register-options', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'E-mail é obrigatório' });

    // Busca usuário no Supabase
    let { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (error) throw error;

    // Se o usuário não existir, cria um novo
    if (!user) {
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert([{ email, devices: [] }])
        .select()
        .single();

      if (createError) throw createError;
      user = newUser;
    }

    // Gera opções para a API WebAuthn do navegador
    const options = await generateRegistrationOptions({
      rpName: 'SafeFintech Vault',
      rpID: RP_ID,
      userID: new TextEncoder().encode(user.id),
      userName: user.email,
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    // Salva o desafio na tabela 'users'
    const { error: updateError } = await supabase
      .from('users')
      .update({ current_challenge: options.challenge })
      .eq('email', email);

    if (updateError) throw updateError;

    res.json(options);
  } catch (err) {
    console.error('Erro em register-options:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 2. ROTA: Verificar e Salvar Credencial Biométrica
// ==========================================
app.post('/api/register-verify', async (req, res) => {
  try {
    const { email, credential } = req.body;

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (error || !user || !user.current_challenge) {
      return res.status(400).json({ error: 'Sessão inválida ou expirada' });
    }

    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge: user.current_challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
    });

    const { verified, registrationInfo } = verification;

    if (verified && registrationInfo) {
      const credData = registrationInfo.credential || registrationInfo;

      const credentialID = credData.id || credData.credentialID;
      const credentialPublicKey = credData.publicKey 
        ? Buffer.from(credData.publicKey).toString('base64url') 
        : credData.credentialPublicKey;

      const newDevice = {
        credentialID: typeof credentialID === 'string' ? credentialID : Buffer.from(credentialID).toString('base64url'),
        credentialPublicKey: typeof credentialPublicKey === 'string' ? credentialPublicKey : Buffer.from(credentialPublicKey).toString('base64url'),
        counter: credData.counter || 0,
      };

      const currentDevices = user.devices || [];
      const updatedDevices = [...currentDevices, newDevice];

      const { error: updateError } = await supabase
        .from('users')
        .update({
          devices: updatedDevices,
          current_challenge: null,
        })
        .eq('email', email);

      if (updateError) throw updateError;

      return res.json({ verified: true, message: 'Dispositivo biométrico cadastrado com sucesso!' });
    }

    res.status(400).json({ verified: false, error: 'Falha na verificação da biometria' });
  } catch (err) {
    console.error('Erro em register-verify:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 3. ROTA: Desafio para Aprovar Transferência
// ==========================================
app.post('/api/auth-options', async (req, res) => {
  try {
    const { email } = req.body;
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (error || !user || !user.devices || user.devices.length === 0) {
      return res.status(400).json({ error: 'Nenhum dispositivo biométrico cadastrado para este e-mail.' });
    }

    const userPasskeys = user.devices.map(dev => ({
      id: dev.credentialID,
      transports: dev.transports,
    }));

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      allowCredentials: userPasskeys,
      userVerification: 'preferred',
    });

    const { error: updateError } = await supabase
      .from('users')
      .update({ current_challenge: options.challenge })
      .eq('email', email);

    if (updateError) throw updateError;

    res.json(options);
  } catch (err) {
    console.error('Erro em auth-options:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 4. ROTA: Validar Assinatura da Transferência
// ==========================================
app.post('/api/auth-verify', async (req, res) => {
  try {
    const { email, credential } = req.body;
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (error || !user || !user.current_challenge) {
      return res.status(400).json({ error: 'Sessão de aprovação expirada.' });
    }

    const dbDevice = (user.devices || []).find(dev => dev.credentialID === credential.id);
    if (!dbDevice) {
      return res.status(400).json({ error: 'Dispositivo não reconhecido.' });
    }

    const verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge: user.current_challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: dbDevice.credentialID,
        publicKey: Buffer.from(dbDevice.credentialPublicKey, 'base64url'),
        counter: dbDevice.counter || 0,
      },
    });

    if (verification.verified) {
      const updatedDevices = user.devices.map(dev => {
        if (dev.credentialID === credential.id) {
          return { ...dev, counter: verification.authenticationInfo.newCounter };
        }
        return dev;
      });

      const { error: updateError } = await supabase
        .from('users')
        .update({
          current_challenge: null,
          devices: updatedDevices,
        })
        .eq('email', email);

      if (updateError) throw updateError;

      return res.json({ verified: true, message: 'Transferência de R$ 2.500.000,00 autorizada com sucesso!' });
    }

    res.status(400).json({ verified: false, error: 'Assinatura biométrica inválida.' });
  } catch (err) {
    console.error('Erro no auth-verify:', err);
    res.status(500).json({ error: err.message });
  }
});

// Inicializa o Servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em: http://localhost:${PORT}`);
});
