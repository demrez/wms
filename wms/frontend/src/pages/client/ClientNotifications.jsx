import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';

const TYPE_ICONS = { order_stage:'📋', invoice:'🧾', defect:'⚠️', info:'ℹ️' };
const TYPE_COLORS = { order_stage:'blue', invoice:'teal', defect:'red', info:'neutral' };

export default function ClientNotifications() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: notifications, isLoading } = useQuery({
    queryKey: ['client-notifications'],
    queryFn: () => api.get('/client/notifications').then(r => r.data),
  });

  const readAll = useMutation({
    mutationFn: () => api.patch('/client/notifications/read-all'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client-notifications'] });
      qc.invalidateQueries({ queryKey: ['client-unread'] });
    },
  });

  const markRead = async (n) => {
    if (!n.is_read) {
      await api.patch(`/client/notifications/${n.id}/read`);
      qc.invalidateQueries({ queryKey: ['client-notifications'] });
      qc.invalidateQueries({ queryKey: ['client-unread'] });
    }
    if (n.order_id) navigate(`/client/orders/${n.order_id}`);
    if (n.invoice_id) navigate('/client/documents');
  };

  const unread = notifications?.filter(n => !n.is_read).length || 0;

  return (
    <div className="client-page" style={{ fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', fontSize:13 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, gap: 12, flexWrap:'wrap' }}>
        <div>
          <div style={{ fontSize:20, fontWeight:700, color:'var(--gray-900)', letterSpacing:'-0.3px' }}>Уведомления</div>
          {unread > 0 && <div style={{ fontSize:12, color:'var(--gray-400)', marginTop:3 }}>{unread} непрочитанных</div>}
        </div>
        {unread > 0 && (
          <button onClick={() => readAll.mutate()}
            className="client-secondary-btn"
            style={{ padding:'8px 14px', background:'var(--surface-hover)', border:'1px solid var(--gray-300)', borderRadius:10, fontSize:12, cursor:'pointer', color:'var(--gray-900)' }}>
            Прочитать все
          </button>
        )}
      </div>

      <div className="client-shell-card" style={{ background:'var(--surface-pane)', border:'1px solid var(--gray-200)', borderRadius:14, overflow:'hidden' }}>
        {isLoading ? (
          <div style={{ padding:48, textAlign:'center', color:'var(--gray-400)' }}>Загрузка...</div>
        ) : notifications?.length === 0 ? (
          <div style={{ padding:'48px', textAlign:'center' }}>
            <div style={{ fontSize:32, marginBottom:12 }}>🔔</div>
            <div style={{ color:'var(--gray-400)' }}>Уведомлений нет</div>
          </div>
        ) : notifications.map((n, i) => (
          <div key={n.id}
            onClick={() => markRead(n)}
            style={{
              display:'flex', alignItems:'flex-start', gap:12, padding:'14px 18px',
              borderBottom: i < notifications.length - 1 ? '1px solid var(--gray-100)' : 'none',
              cursor: n.order_id || n.invoice_id ? 'pointer' : 'default',
              background: n.is_read ? 'var(--surface-pane)' : 'var(--surface-pane-muted)',
              transition:'background .1s',
            }}>
            <div style={{
              width:36, height:36, borderRadius:10, flexShrink:0,
              background: TYPE_COLORS[n.type] === 'blue'
                ? 'rgba(24,95,165,.18)'
                : TYPE_COLORS[n.type] === 'teal'
                  ? 'rgba(29,158,117,.18)'
                  : TYPE_COLORS[n.type] === 'red'
                    ? 'rgba(226,75,74,.16)'
                    : 'var(--surface-hover)',
              display:'flex', alignItems:'center', justifyContent:'center', fontSize:16,
            }}>
              {TYPE_ICONS[n.type] || 'ℹ️'}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontWeight: n.is_read ? 500 : 700, fontSize:13.5, color:'var(--gray-900)' }}>{n.title}</span>
                {!n.is_read && (
                  <div style={{ width:7, height:7, borderRadius:'50%', background:'var(--teal-400)', flexShrink:0 }} />
                )}
              </div>
              {n.body && <div style={{ fontSize:12.5, color:'var(--gray-500)', marginTop:3, lineHeight:1.5 }}>{n.body}</div>}
              <div style={{ fontSize:11, color:'var(--gray-400)', marginTop:4 }}>
                {new Date(n.created_at).toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}
                {(n.order_id || n.invoice_id) && <span style={{ color:'var(--teal-600)', marginLeft:8 }}>Нажмите чтобы открыть →</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
