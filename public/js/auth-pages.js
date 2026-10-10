// 로그인 · 회원가입 화면 (login.html, register.html 공용)
(async () => {
  const { api, initPage, nextUrl, showFieldErrors, setText, toast, HINT_BACK } = BoxTick;
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');

  const user = await initPage({ hints: [HINT_BACK] });
  // 이미 로그인했다면 이 화면은 필요 없다
  if (user) {
    location.replace(nextUrl('/'));
    return;
  }

  const message = document.getElementById('auth-message');
  const params = new URLSearchParams(location.search);

  // 버튼을 잠가 중복 제출을 막고, 끝나면 풀어준다
  async function submitting(form, task) {
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await task();
    } finally {
      button.disabled = false;
    }
  }

  if (loginForm) {
    if (params.get('registered')) setText(message, '가입이 완료되었습니다. 로그인해 주세요.');
    // 로그인 후 돌아갈 곳을 회원가입 링크에도 넘긴다
    if (params.get('next')) {
      document.getElementById('register-link').href = '/register.html?next=' + encodeURIComponent(params.get('next'));
    }

    loginForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const body = { username: loginForm.username.value.trim(), password: loginForm.password.value };
      const fields = {};
      if (!body.username) fields.username = '아이디를 입력해 주세요.';
      if (!body.password) fields.password = '비밀번호를 입력해 주세요.';
      showFieldErrors(loginForm, fields);
      message.classList.remove('auth-message--ok');
      setText(message, '');
      if (Object.keys(fields).length) return;

      submitting(loginForm, async () => {
        try {
          await api('/api/auth/login', { method: 'POST', body });
          location.replace(nextUrl('/'));
        } catch (err) {
          // 401(아이디·비밀번호 불일치), 403(정지 회원) 은 폼 위에 문구로 보여준다
          if (err.status === 401 || err.status === 403 || err.status === 400) {
            setText(message, err.message);
            loginForm.password.value = '';
            loginForm.password.focus();
          } else {
            toast(err.message, 'error');
          }
        }
      });
    });
  }

  if (registerForm) {
    registerForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const body = {
        username: registerForm.username.value.trim(),
        nickname: registerForm.nickname.value.trim(),
        password: registerForm.password.value,
      };
      // 비밀번호 확인은 화면에서만 검사한다 (나머지 규칙은 서버가 판단)
      const fields = {};
      if (body.password !== registerForm.passwordConfirm.value) {
        fields.passwordConfirm = '비밀번호가 일치하지 않습니다.';
      }
      showFieldErrors(registerForm, fields);
      setText(message, '');
      if (Object.keys(fields).length) return;

      submitting(registerForm, async () => {
        try {
          await api('/api/auth/register', { method: 'POST', body });
          const next = params.get('next');
          location.replace('/login.html?registered=1' + (next ? '&next=' + encodeURIComponent(next) : ''));
        } catch (err) {
          if (err.fields && Object.keys(err.fields).length) {
            showFieldErrors(registerForm, err.fields);
            setText(message, err.message);
          } else {
            toast(err.message, 'error');
          }
        }
      });
    });
  }
})();
