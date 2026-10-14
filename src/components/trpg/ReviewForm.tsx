'use client';
// TRPG 리뷰 글 폼 (v2.1) — 목록의 WRITE 모달과 상세의 EDIT 모달이 같이 쓴다.
// 시나리오 이름 · 페어 말머리 · 룰 · 롤 · 별점(두 번째는 선택) · 플레이한 날 · 공개범위 · 본문(한줄 평)
import React, { useState } from 'react';
import { KInput, KSelect, KDate, KCheck } from '@/components/ui/Kit';
import { RichEditor } from '@/components/ui/RichEditor';
import { useToast } from '@/components/ui/Toast';
import type { TrpgReview } from '@/lib/reviewStore';
import type { BoardBadge } from '@/lib/boardStore';
import type { Visibility } from '@/lib/charStore';

export type ReviewFormValue = Pick<TrpgReview, 'title' | 'category' | 'rule' | 'role' | 'stars' | 'stars2' | 'body' | 'playDate' | 'visibility'>;

/** 별점 고르기/보기 — onChange가 있으면 누를 수 있다 */
export function Stars({ value, onChange, label }: { value: number; onChange?: (n: number) => void; label?: string }) {
  return (
    <span className="rv-pick-wrap" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      {label && <span style={{ fontSize: 11.5, color: 'var(--sub)', whiteSpace: 'nowrap' }}>{label}</span>}
      <span className="rv-pick" role={onChange ? 'radiogroup' : undefined}>
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} type="button" className={n <= value ? 'on' : ''} disabled={!onChange}
            data-tip={onChange ? `${n}점` : undefined} onClick={() => onChange?.(n === value ? n - 1 : n)}>★</button>
        ))}
      </span>
    </span>
  );
}

export function ReviewForm({ initial, cats, starNames, onSave, onCancel, saveLabel }: {
  initial: TrpgReview | null;
  cats: BoardBadge[];
  starNames: { a: string; b: string };
  onSave: (v: ReviewFormValue) => void;
  onCancel: () => void;
  saveLabel?: string;
}) {
  const toast = useToast();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [category, setCategory] = useState(initial?.category ?? (cats[0]?.label ?? ''));
  const [rule, setRule] = useState(initial?.rule ?? '');
  const [role, setRole] = useState<TrpgReview['role']>(initial?.role ?? '');
  const [stars, setStars] = useState(initial?.stars ?? 0);
  const [two, setTwo] = useState(initial?.stars2 !== undefined);
  const [stars2, setStars2] = useState(initial?.stars2 ?? 0);
  const [playDate, setPlayDate] = useState(initial?.playDate ?? '');
  const [visibility, setVisibility] = useState<Visibility>(initial?.visibility ?? 'public');
  const [body, setBody] = useState(initial?.body ?? '');

  const save = () => {
    if (!title.trim()) { toast('시나리오 이름을 입력해 주세요'); return; }
    if (stars < 1) { toast('별점을 매겨 주세요'); return; }
    if (two && stars2 < 1) { toast('두 번째 별점을 매기거나 체크를 꺼 주세요'); return; }
    onSave({
      title: title.trim(), category: cats.some(c => c.label === category) ? category : '',
      rule: rule.trim(), role, stars, stars2: two ? stars2 : undefined,
      body, playDate: playDate || undefined, visibility,
    });
  };

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <KInput placeholder="시나리오 이름 (필수)" value={title} onChange={e => setTitle(e.target.value)} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {cats.length > 0 ? (
          <KSelect minWidth={130} value={cats.some(c => c.label === category) ? category : ''} onChange={setCategory}
            options={[{ value: '', label: '말머리 없음' }, ...cats.map(c => ({ value: c.label, label: c.label }))]} />
        ) : (
          <small className="hint" style={{ margin: 0 }}>페어 말머리는 환경설정 › 게시판 관리 › TRPG 리뷰 말머리에서 만듭니다</small>
        )}
        <KInput placeholder="TRPG 룰" value={rule} onChange={e => setRule(e.target.value)} style={{ width: 150 }} />
        {/* 롤 — GM / PC */}
        <div className="mini-seg">
          <button className={role === '' ? 'on' : ''} onClick={() => setRole('')}>롤 없음</button>
          <button className={role === 'GM' ? 'on' : ''} onClick={() => setRole('GM')}>GM</button>
          <button className={role === 'PC' ? 'on' : ''} onClick={() => setRole('PC')}>PC</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <Stars value={stars} onChange={setStars} label={two ? starNames.a : '별점'} />
        <KCheck label="두 번째 별점 (둘이 따로)" checked={two} onChange={setTwo} />
        {two && <Stars value={stars2} onChange={setStars2} label={starNames.b} />}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <KDate value={playDate} onChange={setPlayDate} placeholder="플레이한 날 (선택)" style={{ width: 150 }} />
        <KSelect minWidth={120} value={visibility} onChange={v => setVisibility(v as Visibility)}
          options={[
            { value: 'public', label: '전체공개' },
            { value: 'member', label: '멤버공개' },
            { value: 'private', label: '나만보기' },
          ]} />
      </div>
      <div>
        <label className="k-label">한줄 평 · 본문</label>
        <RichEditor value={body} onChange={setBody} placeholder="한줄 평을 적어 주세요 — 길게 써도 됩니다" />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button className="btn btn-ghost" onClick={onCancel}>CANCEL</button>
        <button className="btn btn-dark" onClick={save}>{saveLabel ?? (initial ? 'SAVE' : 'POST')}</button>
      </div>
    </div>
  );
}
