import { useMemo, useState } from 'react';
import { Button, SearchField } from 'glisse';
import type { ChatSummary } from '../core/types';
import { chatTypeName } from '../core/parseJson';
import { Icon } from './icons';

export function ChatPicker({ list, onPick, onBack }: { list: ChatSummary[]; onPick: (i: number) => void; onBack: () => void }) {
  const [q, setQ] = useState('');
  const shown = useMemo(
    () => list.filter((c) => c.count > 0 && c.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => b.count - a.count),
    [list, q],
  );
  return (
    <div className="picker">
      <div className="picker-head">
        <Button icon={<Icon.back size={18} />} onClick={onBack}>
          Назад
        </Button>
        <h2>Выберите чат</h2>
        <span className="muted">{list.length} чатов в экспорте</span>
      </div>
      <SearchField value={q} onValueChange={setQ} placeholder="Поиск по названию" aria-label="Поиск чата" />
      <ul className="picker-list">
        {shown.map((c) => (
          <li key={c.index}>
            <button onClick={() => onPick(c.index)}>
              <span className="avatar">{c.name.slice(0, 1).toUpperCase()}</span>
              <span className="picker-name">
                {c.name}
                <span className="muted small">
                  {chatTypeName(c.type)}
                  {c.left ? ' · вы покинули' : ''}
                </span>
              </span>
              <span className="picker-count">{c.type === 'html' ? `${Math.round(c.count / 1000)} стр.` : c.count.toLocaleString('ru-RU')}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
