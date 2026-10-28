import { useEffect, useMemo, useRef, useState } from 'react';
import { looksLikePhone } from '../../lib/localProfile.mjs';
import {
  createChatId,
  markChatRead,
  mergeChat,
  readChat,
  subscribeChat,
  type FamilyChatMessage,
} from '../../services/familyChat';
import { familySyncConfigured, fetchChat, publishChatRemote, syncTokenFor } from '../../services/familySync';
import { X } from 'lucide-react';

export interface ChatRoom {
  code: string;
  label: string;
  token?: string | null;
  writeKey?: string;
  readKey?: string;
}

async function roomToken(room: ChatRoom): Promise<string | null> {
  if (room.token && room.token.includes('.')) return room.token;
  if (room.writeKey && room.readKey) return syncTokenFor(room.writeKey, room.readKey);
  return null;
}

export function FamilyChatSheet({
  name,
  rooms,
  onClose,
}: {
  name: string;
  rooms: ChatRoom[];
  onClose: () => void;
}) {
  const [roomCode, setRoomCode] = useState(rooms[0]?.code ?? '');
  const room = rooms.find((item) => item.code === roomCode) ?? rooms[0] ?? null;
  const [messages, setMessages] = useState<FamilyChatMessage[]>(() => (room ? readChat(room.code) : []));
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const roomKey = room ? `${room.code}|${room.token ?? ''}|${room.writeKey ?? ''}|${room.readKey ?? ''}` : '';
  const roomRef = useRef(room);
  useEffect(() => {
    roomRef.current = room;
  });

  useEffect(() => subscribeChat(() => {
    const current = roomRef.current;
    if (current) setMessages(readChat(current.code));
  }), [roomKey]);

  useEffect(() => {
    const current = roomRef.current;
    if (!current) return;
    setMessages(readChat(current.code));
    markChatRead(current.code);
    let cancel = false;
    void (async () => {
      const token = await roomToken(current);
      if (!token || cancel) {
        if (!familySyncConfigured() || !token) setNote('초대가 연결되면 다른 폰에도 전달됩니다. 지금은 이 기기에만 남습니다.');
        return;
      }
      const remote = await fetchChat(current.code, token);
      if (cancel || !remote) return;
      mergeChat(current.code, remote);
      markChatRead(current.code);
    })();
    return () => {
      cancel = true;
    };
  }, [roomKey]);

  const ordered = useMemo(() => messages.slice().sort((left, right) => left.at - right.at), [messages]);

  const send = async () => {
    if (!room || sending) return;
    const text = draft.trim().slice(0, 200);
    if (!text) return;
    if (looksLikePhone(text) || looksLikePhone(name)) {
      setNote('전화번호는 보내지 않습니다.');
      return;
    }
    const message: FamilyChatMessage = {
      id: createChatId(),
      name: name.trim().slice(0, 20) || '나',
      text,
      at: Date.now(),
      mine: true,
    };
    setSending(true);
    setDraft('');
    mergeChat(room.code, [message]);
    markChatRead(room.code);
    const token = await roomToken(room);
    const result = await publishChatRemote(room.code, token, message);
    setNote(result === 'ok' ? null : '가족 서버에 닿지 않아 이 기기에만 남았습니다.');
    setSending(false);
  };

  return (
    <div className="absolute inset-0 z-50 flex items-end bg-slate-900/40">
      <div className="flex max-h-[86%] w-full flex-col rounded-t-3xl bg-white px-5 pb-6 pt-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-black">가족 대화</h2>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-400" aria-label="닫기">
            <X className="h-5 w-5" />
          </button>
        </div>
        {rooms.length > 1 && (
          <div className="mb-3 flex gap-2 overflow-x-auto">
            {rooms.map((item) => (
              <button
                key={item.code}
                type="button"
                onClick={() => setRoomCode(item.code)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${item.code === room?.code ? 'bg-[#0084FF] text-white' : 'bg-slate-100 text-slate-600'}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
        <div className="min-h-48 flex-1 space-y-2 overflow-y-auto pb-3">
          {!room ? (
            <p className="rounded-2xl bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-500">초대를 수락하면 가족 대화가 연결됩니다.</p>
          ) : ordered.length === 0 ? (
            <p className="rounded-2xl bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-500">가족에게 짧은 글을 남겨 보세요.</p>
          ) : ordered.map((message) => (
            <div key={message.id} className={`flex ${message.mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${message.mine ? 'bg-[#0084FF] text-white' : 'bg-slate-100 text-slate-800'}`}>
                {!message.mine && <p className="text-[11px] font-bold text-slate-500">{message.name}</p>}
                <p className="text-sm leading-5">{message.text}</p>
              </div>
            </div>
          ))}
        </div>
        {note && <p className="mb-2 text-[11px] font-semibold leading-4 text-amber-700">{note}</p>}
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={200}
            placeholder="메시지"
            aria-label="메시지"
            className="min-w-0 flex-1 rounded-full bg-slate-100 px-4 py-3 text-sm"
          />
          <button type="submit" disabled={sending || !draft.trim() || !room} className="rounded-full bg-[#0084FF] px-4 py-3 text-sm font-black text-white disabled:opacity-40">
            보내기
          </button>
        </form>
      </div>
    </div>
  );
}
