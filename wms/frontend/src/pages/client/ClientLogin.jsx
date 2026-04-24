import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/auth';
import api from '../../api/client';

export default function ClientLogin() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const { login } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email: email.trim(), password: password.trim() });
      if (data.user.role !== 'client' && data.user.role !== 'admin' && data.user.role !== 'manager') {
        setError('Доступ запрещён');
        return;
      }
      login(data.user, data.token);
      navigate(data.user.role === 'client' ? '/client' : '/');
    } catch (err) {
      setError(err.response?.data?.error || 'Неверный email или пароль');
    } finally { setLoading(false); }
  };

  return (
    <div style={{
      minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center',
      background:'var(--body-bg)',
      fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    }}>
      <div style={{
        background:'var(--surface-pane)', border:'1px solid var(--gray-200)',
        borderRadius:20, padding:'36px 40px',
        width:'100%', maxWidth:380,
        boxShadow:'var(--shadow-md)',
      }}>
        <div style={{ fontSize:22, fontWeight:800, color:'#0F6E56', marginBottom:4, letterSpacing:'-0.5px' }}>
          SMART WMS
        </div>
        <div style={{ fontSize:13, color:'var(--gray-400)', marginBottom:28 }}>Личный кабинет клиента</div>

        <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
            <label style={{ fontSize:12, fontWeight:500, color:'var(--gray-500)' }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com" required
              style={{ padding:'9px 12px', border:'1px solid var(--gray-300)', borderRadius:10, fontSize:13.5, outline:'none', transition:'border .12s', background:'var(--surface-pane-muted)', color:'var(--gray-900)' }}
              onFocus={e => e.target.style.borderColor='var(--teal-400)'}
              onBlur={e => e.target.style.borderColor='var(--gray-300)'}
            />
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
            <label style={{ fontSize:12, fontWeight:500, color:'var(--gray-500)' }}>Пароль</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" required
              style={{ padding:'9px 12px', border:'1px solid var(--gray-300)', borderRadius:10, fontSize:13.5, outline:'none', transition:'border .12s', background:'var(--surface-pane-muted)', color:'var(--gray-900)' }}
              onFocus={e => e.target.style.borderColor='var(--teal-400)'}
              onBlur={e => e.target.style.borderColor='var(--gray-300)'}
            />
          </div>

          {error && (
            <div style={{ padding:'8px 12px', background:'var(--red-50)', color:'var(--red-600)', borderRadius:8, fontSize:12.5, border:'1px solid rgba(226,75,74,.28)' }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading}
            style={{
              marginTop:4, padding:'10px', background:'var(--teal-400)', color:'#fff',
              border:'none', borderRadius:10, fontSize:14, fontWeight:600, cursor:'pointer',
              transition:'background .12s', opacity: loading ? .7 : 1,
            }}
            onMouseOver={e => { if(!loading) e.target.style.background='var(--teal-600)'; }}
            onMouseOut={e => e.target.style.background='var(--teal-400)'}
          >
            {loading ? 'Входим...' : 'Войти'}
          </button>
        </form>

        <div style={{ marginTop:20, paddingTop:16, borderTop:'1px solid var(--gray-100)', fontSize:12, color:'var(--gray-400)', textAlign:'center', lineHeight: 1.7 }}>
          Проблемы со входом? Обратитесь к вашему менеджеру.
        </div>
      </div>
    </div>
  );
}
