'use client';
// TRPG 리뷰 게시판 (v2.1 사용자 요청) — 시나리오마다 별점 + 한줄 평. 페어 말머리 탭 · 검색 · WRITE(모달) · 10개씩 페이지.
// 말머리·별점 이름은 환경설정 > 게시판 관리 「TRPG 리뷰 말머리」, 글쓰기 권한은 환경설정 「권한」(기본: 가입자)
import React, { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useSectionParam, filterSection, sectionSetter, secStamp } from '@/lib/sectionStore';
import { useLocalList, newId, fmtDate } from '@/lib/postStore';
import { TrpgReview, REVIEW_KEY, REVIEW_SEED, starText, reviewExcerpt } from '@/lib/reviewStore';
import { useBoardSettings, reviewCatsOf, reviewStarsOf, boardBadgeStyle } from '@/lib/boardStore';
import { useMenuSettings, canWriteAt, writeKeyOf, writeDefaultOf } from '@/lib/menuStore';
import { SearchBar, Pager } from '@/components/ui/Kit';
import { Modal } from '@/components/ui/Modal';
import { EditableDesc, PageTitle } from '@/components/ui/PageText';
import { ReviewForm } from '@/components/trpg/ReviewForm';
import { useToast } from '@/components/ui/Toast';

const PER = 10;

function ReviewPageInner() {
  const router = useRouter();
  const toast = useToast();
  const { user, isAdmin } = useAuth();
  const [all, setAll, loaded] = useLocalList<TrpgReview>(REVIEW_KEY, REVIEW_SEED);
  const sec = useSectionParam('treview');
  const rows = filterSection(all, sec.id);
  const setRows = sectionSetter(all, sec.id, setAll);
  const [menuSet] = useMenuSettings();
  const { st: boardSet } = useBoardSettings();
  const cats = reviewCatsOf(boardSet, sec.id);
  const starNames = reviewStarsOf(boardSet);
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [writeOpen, setWriteOpen] = useState(false);
  useEffect(() => { setPage(1); }, [q, cat]);

  const canWrite = !!user && canWriteAt(menuSet, writeKeyOf('/treview', sec.id), { loggedIn: !!user, isAdmin, id: user?.id }, writeDefaultOf('/treview'));
  const query = q.trim().toLowerCase();
  const visible = rows
    .filter(r => isAdmin || r.visibility === 'public' || (r.visibility === 'member' && !!user) || (!!user && r.authorId === user.id))
    .filter(r => !cat || r.category === cat)
    .filter(r => !query || r.title.toLowerCase().includes(query) || r.rule.toLowerCase().includes(query)
      || r.category.toLowerCase().includes(query) || reviewExcerpt(r.body).toLowerCase().includes(query))
    .sort((a, b) => (b.playDate ?? b.date.slice(0, 10)).localeCompare(a.playDate ?? a.date.slice(0, 10)) || b.date.localeCompare(a.date));
  const pages = Math.max(1, Math.ceil(visible.length / PER));
  const cur = Math.min(page, pages);
  const paged = visible.slice((cur - 1) * PER, cur * PER);
  const badgeOf = (label: string) => cats.find(c => c.label === label);

  if (!loaded) return <section className="page" />;

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>{sec.id === 'main' ? 'TRPG REVIEW' : sec.name}</PageTitle>
        <EditableDesc k="treview-desc" def="시나리오마다 별점과 한줄 평 — 페어별 말머리로 모아 봅니다" />
      </div>
      <div className="toolrow">
        <div className="seg">
          <button className={cat === '' ? 'on' : ''} onClick={() => setCat('')}>ALL</button>
          {cats.map(c => (
            <button key={c.id} className={cat === c.label ? 'on' : ''} onClick={() => setCat(c.label)}>{c.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <SearchBar placeholder="시나리오·룰·말머리·평 검색" onSearch={setQ} />
          {canWrite && <button className="btn btn-dark" onClick={() => setWriteOpen(true)}>✎ WRITE</button>}
        </div>
      </div>

      {paged.length > 0 && (
        <div className="rv-list">
          {paged.map(r => {
            const ex = reviewExcerpt(r.body);
            return (
              <article key={r.id} className="panel rv-row" onClick={() => router.push(`/treview/${r.id}`)}>
                <div className="hd">
                  {r.category && <span style={boardBadgeStyle(badgeOf(r.category))}>{r.category}</span>}
                  <b>{r.title}</b>
                  {r.role && <span className="pill dark">{r.role}</span>}
                  <span className="meta">{[r.rule, r.playDate ? r.playDate.replace(/-/g, '.') : fmtDate(r.date)].filter(Boolean).join(' · ')}</span>
                </div>
                <div className="rv-stars">
                  <span className="s">{r.stars2 !== undefined && <>{starNames.a}</>}<i>{starText(r.stars)}</i></span>
                  {r.stars2 !== undefined && <span className="s">{starNames.b}<i>{starText(r.stars2)}</i></span>}
                </div>
                {ex && <div className="ex">{ex}</div>}
              </article>
            );
          })}
        </div>
      )}
      {visible.length === 0 && (
        <div className="panel" style={{ textAlign: 'center', padding: 44, fontSize: 13, color: 'var(--faint)' }}>
          {query ? '검색 결과가 없습니다' : '아직 리뷰가 없습니다'}
        </div>
      )}
      {visible.length > PER && <Pager page={cur} total={pages} onChange={setPage} />}

      {/* 글쓰기 — 모달 (별점·한줄 평이라 페이지를 따로 두지 않았다) */}
      <Modal open={writeOpen} onClose={() => setWriteOpen(false)} title="리뷰 쓰기"
        desc="시나리오 이름 · 페어 말머리 · 룰 · 롤 · 별점 · 한줄 평">
        {writeOpen && user && (
          <ReviewForm initial={null} cats={cats} starNames={starNames}
            onCancel={() => setWriteOpen(false)}
            onSave={v => {
              const r: TrpgReview = {
                id: newId(), ...v, date: new Date().toISOString(), author: user.nickname, authorId: user.id, ...secStamp(sec.id),
              };
              setRows([r, ...rows]);
              setWriteOpen(false);
              toast('리뷰가 등록되었습니다');
            }} />
        )}
      </Modal>
    </section>
  );
}

/** ?s= 를 읽으므로 Suspense 경계가 필요하다 (Next App Router) */
export default function ReviewPage() {
  return <Suspense fallback={<section className="page" />}><ReviewPageInner /></Suspense>;
}
