function showAlert(message, type = 'info') {
  const alertBox = document.getElementById('alertBox');
  const alertTypes = {
    info: 'alert-info bg-info bg-opacity-10 text-info border-info',
    success: 'alert-success bg-success bg-opacity-10 text-success border-success',
    warning: 'alert-warning bg-warning bg-opacity-10 text-warning border-warning',
    danger: 'alert-danger bg-danger bg-opacity-10 text-danger border-danger'
  };

  alertBox.className = `alert ${alertTypes[type] || alertTypes.info} border shadow-sm`;
  alertBox.innerHTML = message;
  alertBox.classList.remove('d-none');
}

// 1. Cadastrar Biometria
document.getElementById('btnRegister').addEventListener('click', async () => {
  const email = document.getElementById('username').value;
  if (!email) {
    showAlert('<i class="bi bi-exclamation-circle me-1"></i> Digite o e-mail do diretor.', 'warning');
    return;
  }

  try {
    showAlert('<i class="bi bi-hourglass-split me-1"></i> Solicitando desafio ao servidor...', 'info');

    const resp = await fetch('/api/register-options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    const options = await resp.json();
    if (options.error) throw new Error(options.error);

    showAlert('<i class="bi bi-fingerprint me-1"></i> Confirme sua biometria no leitor do dispositivo...', 'warning');

    const credential = await SimpleWebAuthnBrowser.startRegistration({ optionsJSON: options });

    showAlert('<i class="bi bi-shield-check me-1"></i> Salvando chave pública no servidor...', 'info');

    const verifyResp = await fetch('/api/register-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, credential })
    });

    const verifyResult = await verifyResp.json();

    if (verifyResult.verified) {
      showAlert('<i class="bi bi-check-circle-fill me-1"></i> <strong>Sucesso!</strong> Chave biométrica registrada com segurança.', 'success');
    } else {
      throw new Error(verifyResult.error || 'Falha ao registrar.');
    }
  } catch (error) {
    console.error(error);
    showAlert(`<i class="bi bi-x-circle-fill me-1"></i> Erro: ${error.message}`, 'danger');
  }
});

// 2. Aprovar Transferência
document.getElementById('btnApprove').addEventListener('click', async () => {
  const email = document.getElementById('username').value;
  if (!email) {
    showAlert('<i class="bi bi-exclamation-circle me-1"></i> Preencha o e-mail do diretor na aba "1. Credencial" primeiro.', 'warning');
    return;
  }

  try {
    showAlert('<i class="bi bi-hourglass-split me-1"></i> Solicitando autorização de transferência...', 'info');

    const resp = await fetch('/api/auth-options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    const options = await resp.json();
    if (options.error) throw new Error(options.error);

    showAlert('<i class="bi bi-fingerprint me-1"></i> Coloque o dedo na biometria para autorizar R$ 2.500.000,00...', 'warning');

    const credential = await SimpleWebAuthnBrowser.startAuthentication({ optionsJSON: options });

    showAlert('<i class="bi bi-shield-lock me-1"></i> Verificando assinatura biométrica...', 'info');

    const verifyResp = await fetch('/api/auth-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, credential })
    });

    const verifyResult = await verifyResp.json();

    if (verifyResult.verified) {
      showAlert('<i class="bi bi-check-circle-fill me-1"></i> <strong>TRANSFERÊNCIA APROVADA!</strong> R$ 2.500.000,00 transferidos com sucesso.', 'success');
    } else {
      throw new Error(verifyResult.error || 'Assinatura recusada.');
    }
  } catch (error) {
    console.error(error);
    showAlert(`<i class="bi bi-x-circle-fill me-1"></i> Erro ao aprovar: ${error.message}`, 'danger');
  }
});