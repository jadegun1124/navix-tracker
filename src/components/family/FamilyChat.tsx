import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { formatClockSeoul } from '../../lib/activity';
import type { FamilyMessage } from '../../types/family';

export function FamilyChat({
  title,
  messages,
  selfId,
  legacy,
  onClose,
  onSend,
}: {
  title: string;
  messages: FamilyMessage[];
  selfId: string;
  legacy: boolean;
  onClose: () => void;
  onSend: (body: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  return (
    <div className="absolute inset-0 z-30 flex items-end bg-slate-900/40">
      <div className="flex max-h-[86%] w-full flex-col rounded-t-3xl bg-white">
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <div>
            <h2 className="text-lg font-black">{title}</h2>
            <p className="text-[11px] text-slate-400">가족만 주고받습니다. 전화번호는 보내지 않습니다.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-400" aria-label="닫기">
            <X className="h-5 w-5" />
          </button>
        </div>
        {legacy && (
          <p className="mx-5 rounded-2xl bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-950">
            이 서버는 아직 대화를 저장하지 않습니다. 가족 폰과 맞추려면 Worker를 다시 배포해야 합니다. 이 폰의 메시지는 남아 있습니다.
          </p>
        )}
        <div className="min-h-48 flex-1 space-y-2 overflow-y-auto px-5 py-3">
          {messages.length === 0 && <p className="text-sm leading-6 text-slate-500">아직 메시지가 없습니다. 아래 칸에 적으면 같은 가족 방에 전달됩니다.</p>}
          {messages.map((message) => {
            const mine = message.fromId === selfId;
            return (
              <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${mine ? 'bg-[#0084FF] text-white' : 'bg-slate-100 text-slate-800'}`}>
                  {!mine && <p className="text-[11px] font-bold opacity-70">{message.from}</p>}
                  <p className="whitespace-pre-wrap text-sm leading-5">{message.body}</p>
                  <p className={`mt-1 text-[10px] ${mine ? 'text-blue-100' : 'text-slate-400'}`}>{formatClockSeoul(message.at)}</p>
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
        <form
          className="flex gap-2 border-t border-slate-100 px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))]"
          onSubmit={(event) => {
            event.preventDefault();
            const body = draft.trim();
            if (!body) return;
            onSend(body);
            setDraft('');
          }}
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value.slice(0, 500))}
            placeholder="가족에게 보내기"
            aria-label="메시지"
            className="min-w-0 flex-1 rounded-full border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#0084FF]"
          />
          <button type="submit" disabled={!draft.trim()} className="rounded-full bg-[#0084FF] px-4 py-3 text-sm font-bold text-white disabled:opacity-40">
            보내기
          </button>
        </form>
      </div>
    </div>
  );
}
