import { useMemo } from 'react';

const SERVICE_URL = import.meta.env.VITE_HONEST_SIGN_URL || '/qr/?tab=constructor';

export default function HonestSign() {
  const iframeSrc = useMemo(() => SERVICE_URL, []);

  return (
    <div className="honest-sign-page">
      <div className="page-header honest-sign-header">
        <div>
          <h1 className="page-title">Честный знак</h1>
          <div className="text-muted">
            Встроенный конструктор этикеток и кодов ЧЗ. Доступ: <strong>admin / admin</strong>.
          </div>
        </div>
        <div className="honest-sign-actions">
          <a
            className="btn btn-secondary btn-sm"
            href={iframeSrc}
            target="_blank"
            rel="noreferrer"
          >
            Открыть сервис
          </a>
        </div>
      </div>

      <div className="card honest-sign-shell">
        <div className="honest-sign-shell-head">
          <div>
            <div className="honest-sign-shell-title">Конструктор наклеек</div>
            <div className="text-muted text-sm">
              Открывается в режиме конструктора на странице <strong>/qr</strong>
            </div>
          </div>
          <span className="badge badge-green">ЧЗ</span>
        </div>

        <iframe
          className="honest-sign-frame"
          title="Честный знак"
          src={iframeSrc}
        />
      </div>
    </div>
  );
}
