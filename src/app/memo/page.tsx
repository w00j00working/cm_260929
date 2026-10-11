'use client';
// 스티커 메모장 (4.6) — 포스트잇 보드: 드래그 자유 배치 · 색/크기 · 랜덤 기울기 ·
// 클릭 = 맨 위로 · 우클릭 자체 컨텍스트 메뉴(순서/수정/삭제) · 우측 메모 리스트 · 작성 권한 옵션
import React, { useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useLocalList, newId } from '@/lib/postStore';
import {
  StickyMemo, MEMO_SEED, MEMO_COLORS, MEMO_SIZE_W, useMemoSettings,
} from '@/lib/memoStore';
import { fmtMD } from '@/lib/threadStore';
import { Modal, useConfirmDelete } from '@/components/ui/Modal';
import { KTextarea } from '@/components/ui/Kit';
import { ColorField } from '@/components/ui/ColorField';
import { EditableDesc, PageTitle } from '@/components/ui/PageText';
import { useToast } from '@/components/ui/Toast';

export default function MemoPage() {
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const del = useConfirmDelete();
  const [memos, setMemos, loaded] = useLocalList<StickyMemo>('ohome.memo.v1', MEMO_SEED);
  const [settings] = useMemoSettings();
  const boardRef = useRef<HTMLDivElement>(null);
  const [focusId, setFocusId] = useState<string | null>(null);

  const canWrite = isAdmin || (!!user && settings.allowMember);
  const canTouch = (m: StickyMemo) => isAdmin || (!!user && m.authorId === user.id);
  const maxZ = () => Math.max(0, ...memos.map(m => m.z));

  /* ---------- 드래그 (배치 저장 — 모두에게 동일) ---------- */
  const onDown = (e: React.PointerEvent, m: StickyMemo) => {
    if (e.button !== 0) return;
    const el = e.currentTarget as HTMLElement;
    const board = boardRef.current!;
    const br = board.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const ox = e.clientX - r.left, oy = e.clientY - r.top;
    const movable = canTouch(m);
    if (movable) document.body.classList.add('drag-move');   // 드래그 중 커서 고정 (v1.9)
    let moved = false;
    let fx = m.x, fy = m.y;
    const mv = (ev: PointerEvent) => {
      if (!movable) return;
      moved = true;
      const px = Math.max(0, Math.min(br.width - r.width, ev.clientX - br.left - ox));
      const py = Math.max(0, Math.min(br.height - r.height, ev.clientY - br.top - oy));
      fx = (px / br.width) * 100;
      fy = (py / br.height) * 100;
      el.style.left = `${fx}%`;
      el.style.top = `${fy}%`;
    };
    const up = () => {
      document.body.classList.remove('drag-move');
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      // 이동 커밋 + 맨 위로 (클릭만 해도 맨 위로 — 4.6 겹침 순서)
      setMemos(memos.map(x => x.id === m.id ? { ...x, x: fx, y: fy, z: maxZ() + 1 } : x));
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    e.preventDefault();
  };

  /* ---------- 우클릭 컨텍스트 메뉴 (자체 스타일 — 4.6 v1.8) ---------- */
  // list: 우측 리스트에서 열림 — 순서 항목 없이 수정/삭제만
  const [ctx, setCtx] = useState<{ id: string; x: number; y: number; list?: boolean } | null>(null);
  const onCtx = (e: React.MouseEvent, m: StickyMemo, list = false) => {
    e.preventDefault();
    if (!canTouch(m)) return;
    setCtx({ id: m.id, x: e.clientX, y: e.clientY, list });
  };
  const zOrder = (mode: 'up' | 'down' | 'top' | 'bottom') => {
    if (!ctx) return;
    const cur = memos.find(m => m.id === ctx.id);
    if (!cur) return;
    const zs = memos.map(m => m.z);
    let next = memos;
    if (mode === 'top') next = memos.map(m => m.id === cur.id ? { ...m, z: Math.max(...zs) + 1 } : m);
    if (mode === 'bottom') next = memos.map(m => m.id === cur.id ? { ...m, z: Math.min(...zs) - 1 } : m);
    if (mode === 'up') {
      const hi = zs.filter(z => z > cur.z);
      if (hi.length) {
        const nz = Math.min(...hi);
        next = memos.map(m => m.z === nz ? { ...m, z: cur.z } : m.id === cur.id ? { ...m, z: nz } : m);
      }
    }
    if (mode === 'down') {
      const lo = zs.filter(z => z < cur.z);
      if (lo.length) {
        const nz = Math.max(...lo);
        next = memos.map(m => m.z === nz ? { ...m, z: cur.z } : m.id === cur.id ? { ...m, z: nz } : m);
      }
    }
    setMemos(next);
    setCtx(null);
  };

  /* ---------- 등록/수정 모달 ---------- */
  const [mOpen, setMOpen] = useState(false);
  const [mId, setMId] = useState<string | null>(null); // null = 새 메모
  const [mText, setMText] = useState('');
  const [mColor, setMColor] = useState(MEMO_COLORS[0]);
  const [mSize, setMSize] = useState<StickyMemo['size']>('m');
  const openNew = () => {
    setMId(null); setMText('');
    setMColor(MEMO_COLORS[memos.length % MEMO_COLORS.length]); setMSize('m');
    setMOpen(true);
  };
  const openEdit = (m: StickyMemo) => {
    setMId(m.id); setMText(m.text); setMColor(m.color); setMSize(m.size);
    setMOpen(true); setCtx(null);
  };
  const save = () => {
    if (!mText.trim()) { toast('내용을 입력해 주세요'); return; }
    if (mId) {
      setMemos(memos.map(m => m.id === mId ? { ...m, text: mText.trim(), color: mColor, size: mSize } : m));
    } else {
      const m: StickyMemo = {
        id: newId(), text: mText.trim(),
        author: user?.nickname ?? '관리자', authorId: user?.id ?? 'admin',
        color: mColor, size: mSize,
        x: 6 + Math.random() * 55, y: 6 + Math.random() * 55,
        rot: Math.round((Math.random() * 6 - 3) * 10) / 10, // 랜덤 기울기 (4.6)
        z: maxZ() + 1, date: new Date().toISOString(),
      };
      setMemos([...memos, m]);
    }
    setMOpen(false);
  };
  const remove = (m: StickyMemo) => {
    setCtx(null);
    del.ask('메모를 삭제하시겠습니까?', () => setMemos(memos.filter(x => x.id !== m.id)));
  };

  const focus = (id: string) => {
    setMemos(memos.map(m => m.id === id ? { ...m, z: maxZ() + 1 } : m));
    setFocusId(id);
    setTimeout(() => setFocusId(f => (f === id ? null : f)), 900);
  };

  if (!loaded) return <section className="page" />;

  const sorted = [...memos].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <section className="page" onClick={() => setCtx(null)}>
      <div className="page-head">
        <PageTitle>STICKY NOTES</PageTitle>
        <EditableDesc k="memo-desc" def="드래그 자유 배치 · 색상/기울기 · 작성 권한 옵션" />
      </div>
      <div className="memo-layout">
        {/* 보드 — 배치·순서 저장, 모두에게 동일 (4.6) */}
        <div className="memoboard" ref={boardRef}
          onContextMenu={e => { if (!(e.target as Element).closest('.postit')) setCtx(null); }}>
          {memos.map(m => (
            <div key={m.id}
              className={`postit ${focusId === m.id ? 'hl' : ''} ${canTouch(m) ? '' : 'ro'}`}
              style={{
                left: `${m.x}%`, top: `${m.y}%`, zIndex: m.z,
                transform: `rotate(${m.rot}deg)`, background: m.color, width: MEMO_SIZE_W[m.size],
              }}
              onPointerDown={e => onDown(e, m)}
              onContextMenu={e => onCtx(e, m)}>
              {settings.showAuthor && <b>{m.author}</b>}
              {m.text}
            </div>
          ))}
        </div>
        {/* 우측 메모 리스트 (v1.8) — 클릭 시 보드의 메모가 맨 위로 + 하이라이트 */}
        <div className="panel" style={{ padding: 12 }}>
          <h4 style={{ fontSize: 11, letterSpacing: '.14em', color: 'var(--faint)', padding: '4px 6px 10px' }}>MEMO LIST</h4>
          {sorted.map(m => (
            <div key={m.id} className="memo-list-item" onClick={() => focus(m.id)}
              onContextMenu={e => onCtx(e, m, true)}>
              <span className="cdot" style={{ background: m.color }} />
              <div style={{ minWidth: 0 }}>
                <b>{m.author} · {fmtMD(m.date)}</b>
                <p>{m.text}</p>
              </div>
            </div>
          ))}
          {canWrite && (
            <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
              onClick={openNew}>＋ MEMO</button>
          )}
        </div>
      </div>

      {/* 우클릭 순서 메뉴 — 위로/아래로/맨위로/맨아래로 + 수정/삭제 (권한자) */}
      {ctx && (
        <div className="ctx-menu on" style={{ left: ctx.x, top: ctx.y }} onClick={e => e.stopPropagation()}>
          {/* 순서 항목은 보드에서 열었을 때만 — 리스트에서는 수정/삭제만 */}
          {!ctx.list && (
            <>
              <button onClick={() => zOrder('up')}>위로</button>
              <button onClick={() => zOrder('down')}>아래로</button>
              <div className="sep" />
              <button onClick={() => zOrder('top')}>맨위로</button>
              <button onClick={() => zOrder('bottom')}>맨아래로</button>
              <div className="sep" />
            </>
          )}
          <button onClick={() => { const m = memos.find(x => x.id === ctx.id); if (m) openEdit(m); }}>수정</button>
          <button onClick={() => { const m = memos.find(x => x.id === ctx.id); if (m) remove(m); }}>삭제</button>
        </div>
      )}

      {/* 메모 등록/수정 모달 — 내용 + 색 + 크기 */}
      <Modal open={mOpen} onClose={() => setMOpen(false)} small title={mId ? '메모 수정' : '메모 붙이기'} dirty
        actions={<>
          <button className="btn btn-ghost" onClick={() => setMOpen(false)}>CANCEL</button>
          <button className="btn btn-dark" onClick={save}>{mId ? 'SAVE' : 'ADD'}</button>
        </>}>
        <div style={{ display: 'grid', gap: 12 }}>
          <KTextarea style={{ minHeight: 90 }} value={mText} onChange={e => setMText(e.target.value)} />
          <div className="memo-chips">
            {MEMO_COLORS.map(c => (
              <span key={c} className={`c ${mColor === c ? 'on' : ''}`} style={{ background: c }}
                onClick={() => setMColor(c)} />
            ))}
            <ColorField value={mColor} onChange={setMColor} />
          </div>
          <div className="mini-seg" style={{ justifySelf: 'start' }}>
            <button className={mSize === 's' ? 'on' : ''} onClick={() => setMSize('s')}>작게</button>
            <button className={mSize === 'm' ? 'on' : ''} onClick={() => setMSize('m')}>보통</button>
            <button className={mSize === 'l' ? 'on' : ''} onClick={() => setMSize('l')}>크게</button>
          </div>
        </div>
      </Modal>
      {del.element}
    </section>
  );
}
