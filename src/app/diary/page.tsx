'use client';
// 다이어리 (4.14) — 아코디언 목록: 제목+무드+날짜 한 줄, 클릭 시 그 자리에서 펼침 ·
// 무드 필터 · 페이지네이션 · 공개범위(비공개는 관리자만)
// v2.1: 구분 탭(환경설정 > 다이어리) — 탭마다 자관이나 AU를 연동한다. 페어 자관을 연동한 탭은 자놀홈처럼
//   왼쪽·오른쪽 캐릭터 칸으로 나뉘어 두 사람이 같이 쓴다(칸마다 캐릭터 머리 · ＋ WRITE · 5개씩 페이지).
//   연동하지 않은 탭은 오너의 일기 한 칸(미니 캘린더 포함)
import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useFonts } from '@/lib/fontStore';
import { useSectionParam, filterSection, sectionSetter, secQuery } from '@/lib/sectionStore';
import { useMenuSettings, canWriteAt, writeKeyOf, writeDefaultOf } from '@/lib/menuStore';
import { useLocalList } from '@/lib/postStore';
import { DiaryPost, DIARY_SEED, Mood, MOOD_SEED, moodTint, useDiarySettings, parseDiaryLink, diaryOrder, diaryCatMode, ownerSides } from '@/lib/diaryStore';
import { Character, CHAR_SEED, Relation, REL_SEED, charWithAu, hasRelGrant, charGrant, charPath, pairSides } from '@/lib/charStore';
import { useMembers } from '@/lib/members';
import { renderBody } from '@/lib/sanitize';
import { SearchBar, Pager } from '@/components/ui/Kit';
import { ConfirmModal } from '@/components/ui/Modal';
import { Lightbox } from '@/components/ui/Lightbox';
import { BlobImg, useBlobUrl } from '@/lib/blobStore';
import { CroppedBlobImg } from '@/components/ui/CropEditor';
import { EditableDesc, PageTitle } from '@/components/ui/PageText';

const PAGE_SIZE = 10;   // 한 칸일 때
const PER_COL = 5;      // 두 사람 칸일 때 — 칸마다 (자놀홈과 같은 수)

/** 칸 — 왼쪽/오른쪽 캐릭터, 또는 한 칸 */
type Side = 'l' | 'r' | 'one';

function MoodIcon({ mood, size = 30 }: { mood?: Mood; size?: number }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      // 줄높이를 1로 눌러야 글자 상자가 아니라 글자 자체가 가운데로 온다 (v2.0 사용자 발견)
      display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
      fontSize: size * 0.45,
      background: moodTint(mood?.color ?? '#888'), color: mood?.color ?? 'var(--sub)',
    }}>{mood?.icon ?? '·'}</span>
  );
}

/** 오너 칸 머리의 프로필 사진 (v2.1 사용자 요청 — 각자 마이페이지에서 정한 사진) · 사진이 없으면 단색 + 머리글자 */
function OwnerFace({ url, color, name }: { url?: string; color?: string; name: string }) {
  const src = useBlobUrl(url);
  return (
    <span className="dy-cf txt" style={{ background: src ? undefined : (color ?? 'linear-gradient(135deg,#6b7280,#3c434d)') }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt="" /> : name.slice(0, 1)}
    </span>
  );
}

function DiaryBody({ p, onOpen }: { p: DiaryPost; onOpen: (ids: string[], idx: number) => void }) {
  const html = useMemo(() => renderBody('md', p.body), [p.body]);
  return (
    <div className="dy-body">
      <div className="post-body" dangerouslySetInnerHTML={{ __html: html }} />
      {/* 이미지는 썸네일 리스트로 — 클릭하면 뷰어(좌우 넘김) (v1.9 사용자 확정) */}
      {p.imgIds.length > 0 && (
        <div className="dy-thumbs">
          {p.imgIds.map((id, i) => (
            <div key={id} className="dy-thumb" onClick={() => onOpen(p.imgIds, i)}>
              <BlobImg fileRef={id} ph="" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DiaryPageInner() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const { familyOf } = useFonts();   // 캐릭터 칸 이름은 캐릭터의 이름 폰트로 (v2.1 사용자 요청 — 오너 칸은 기본 글꼴)
  const [postsAll, setPostsAll, loaded] = useLocalList<DiaryPost>('ohome.diary.v1', DIARY_SEED);
  // 여러 개로 만든 섹션 (v2.0) — 주소의 ?s= 가 가리키는 것만 보여 준다
  const sec = useSectionParam('diary');
  const posts = filterSection(postsAll, sec.id);
  // 저장은 이 섹션 자리만 교체 — 걸러진 목록을 그대로 넘겨도 다른 섹션이 지워지지 않는다
  const setPosts = sectionSetter(postsAll, sec.id, setPostsAll);
  const [moods] = useLocalList<Mood>('ohome.moods.v1', MOOD_SEED);
  // 글쓰기 권한 (v2.1) — 환경설정 「권한」에서 다이어리마다 (기본: 관리자) · 수정·삭제는 쓴 본인과 관리자
  const [menuSet] = useMenuSettings();
  const canWrite = canWriteAt(menuSet, writeKeyOf('/diary', sec.id), { loggedIn: !!user, isAdmin, id: user?.id }, writeDefaultOf('/diary'));
  const canEdit = (p: DiaryPost) => isAdmin || (!!user && p.authorId === user.id);
  /* 구분 탭 (v2.1 사용자 요청 — 「탭을 여러 개 만들 수 있는 형식」, 환경설정 > 다이어리에서 관리).
     「전체」 탭은 없다 — 처음 화면은 맨 위 구분. 구분이 하나도 없으면 탭 없이 전부, 구분 없는 일기는 「구분 없음」 탭(있을 때만).
     탭마다 자관이나 AU를 연동할 수 있다 — 연동한 탭은 그 자관/AU의 일기, 아니면 오너의 일기 */
  const [dset, , dsetLoaded] = useDiarySettings();
  const [rels] = useLocalList<Relation>('ohome.rels.v1', REL_SEED);
  const [chars] = useLocalList<Character>('ohome.chars.v1', CHAR_SEED);
  const members = useMembers();
  // 오너(사이트 관리자) — 회원 목록의 관리자, 브라우저 모드에서는 'admin'
  const adminId = members.find(m => m.role === 'admin')?.id ?? 'admin';
  const memberOf = (id?: string) => (id ? members.find(m => m.id === id) : undefined);
  const ownerName = memberOf(adminId)?.nickname;
  const nickOf = (id?: string) => memberOf(id)?.nickname;
  const [fCat, setFCat] = useState<string | null>(null);   // null = 아직 안 고름 → 맨 위 구분
  const effCat = dset.cats.length === 0 ? 'all'
    : fCat === 'none' || (fCat && dset.cats.some(c => c.id === fCat)) ? fCat : dset.cats[0].id;
  const curCat = dset.cats.find(c => c.id === effCat);
  // 탭 방식 (v2.1 사용자 요청) — 오너(사람)끼리 쓰는 탭 / 캐릭터(자관·AU)로 쓰는 탭
  const catMode = diaryCatMode(curCat);
  // 오너 탭의 왼쪽·오른쪽 사람 (v2.1 사용자 요청 — 환경설정에서 누가 어느 쪽인지 고른다)
  const os = catMode === 'owner' ? ownerSides(curCat, adminId) : {};
  const link = catMode === 'char' ? parseDiaryLink(curCat?.link) : null;
  const linkRel = link ? rels.find(r => r.id === link.relId) : undefined;
  const linkAu = linkRel && link && link.auId !== 'base' ? linkRel.aus.find(a => a.id === link.auId) : undefined;
  const linkKey = linkRel && linkAu ? `${linkRel.id}:${linkAu.id}` : null;
  /** 캐릭터 — AU를 연동했으면 그 AU 모습(이름·사진·색)으로 */
  const charOf = (id?: string) => {
    const c = chars.find(x => x.id === id);
    return c ? (linkKey ? charWithAu(c, linkKey) : c) : undefined;
  };
  // 탭 머리에 보일 캐릭터들 — 연동한 자관의 멤버
  const linkChars = linkRel
    ? linkRel.members.map(m => charOf(m.charId)).filter((c): c is Character => !!c)
    : [];
  /* 두 사람 칸 (v2.1 사용자 요청 — 자놀홈처럼). 캐릭터 탭: 페어 자관의 왼쪽/오른쪽 캐릭터 칸 ·
     오너 탭에 상대 오너를 정해 뒀으면 오너 | 상대 오너 칸. 3인+ 자관이나 상대 없는 오너 탭은 한 칸 */
  type Col = { side: 'l' | 'r'; char?: Character; uid?: string; name: string; color?: string; avatar?: string };
  const pair = linkRel ? pairSides(linkRel) : null;
  const colOfChar = (side: 'l' | 'r', cid: string): Col => {
    const c = charOf(cid);
    return { side, char: c, name: c?.name ?? '—', color: c?.color };
  };
  const colOfOwner = (side: 'l' | 'r', uid: string): Col => {
    const m = memberOf(uid);
    return { side, uid, name: m?.nickname ?? (uid === adminId ? '오너' : uid), avatar: m?.avatarUrl, color: m?.avatarColor };
  };
  const cols: [Col, Col] | null = pair
    ? [colOfChar('l', pair[0]), colOfChar('r', pair[1])]
    : os.l && os.r
      ? [colOfOwner('l', os.l), colOfOwner('r', os.r)]
      : null;
  /** 이 일기가 어느 칸인지 — 오너 탭: 상대 오너가 쓴 것만 오른쪽 · 캐릭터 탭: 쓴 캐릭터로.
   *  캐릭터 없이 쓴 일기는 쓴 사람이 권한을 가진 쪽, 그다음 자캐(own) 쪽 */
  const sideOf = (p: DiaryPost): Side => {
    if (!cols) return 'one';
    if (catMode === 'owner') return p.authorId === os.r ? 'r' : 'l';
    if (p.charId === pair![0]) return 'l';
    if (p.charId === pair![1]) return 'r';
    const L = chars.find(c => c.id === pair![0]);
    const R = chars.find(c => c.id === pair![1]);
    if (p.authorId && R && charGrant(R, p.authorId)) return 'r';
    if (p.authorId && L && charGrant(L, p.authorId)) return 'l';
    return R?.own && !L?.own ? 'r' : 'l';
  };
  // 이 탭에 쓸 수 있는 사람 — 권한 설정 외에, 오너 탭의 상대 오너와 캐릭터 탭의 자관 캐릭터 권한을 받은 회원도 (두 사람이 같이 쓰는 일기)
  const canWriteHere = canWrite
    || (!!user && (user.id === os.l || user.id === os.r))
    || (!!user && !!linkRel && hasRelGrant(linkRel.members, chars, user.id));
  /** 그 칸에 쓸 수 있는 사람 — 상대 오너 칸은 그 사람만 · 캐릭터 칸은 관리자·글쓰기 권한 회원 누구나, 캐릭터 권한을 받은 회원은 그 캐릭터만 */
  const canWriteCol = (col: Col) => {
    if (!user) return false;
    // 오너 칸: 그 사람 본인 (관리자는 관리자 자리에)
    if (col.uid) return user.id === col.uid || (isAdmin && (col.uid === adminId || memberOf(col.uid)?.role === 'admin'));
    if (isAdmin || canWrite) return true;
    return !!col.char && !!charGrant(col.char, user.id);
  };
  // 펼친 일기 — 칸마다 하나씩 (양쪽을 다 열어 둘 수 있고, 같은 칸의 다른 일기를 누르면 그쪽만 바뀐다)
  const [open, setOpen] = useState<Record<Side, string | null>>({ l: null, r: null, one: null });
  const [pages, setPages] = useState<Record<Side, number>>({ l: 1, r: 1, one: 1 });
  const resetPages = () => setPages({ l: 1, r: 1, one: 1 });
  const [fMood, setFMood] = useState('all');
  const [q, setQ] = useState('');
  const [delFor, setDelFor] = useState<DiaryPost | null>(null);
  const [lb, setLb] = useState<{ srcs: string[]; idx: number } | null>(null); // 이미지 뷰어 (v1.9)
  // 미니 캘린더 (4.14 달력 보기) — 달을 넘기면 그 달의 일기만 표시 (한 칸일 때)
  const now = new Date();
  const [view, setView] = useState<{ y: number; m: number }>({ y: now.getFullYear(), m: now.getMonth() });
  const [monthFilter, setMonthFilter] = useState(false);

  // 메인 위젯에서 특정 일기로 진입 — /diary#id (4.14). 구분 탭도 그 일기 쪽으로 (v2.1)
  useEffect(() => {
    if (!loaded || !dsetLoaded) return;
    const h = window.location.hash.slice(1);
    if (!h) return;
    const p = posts.find(x => x.id === h);
    if (!p) return;
    if (dset.cats.length) setFCat(p.catId && dset.cats.some(c => c.id === p.catId) ? p.catId : 'none');
    setOpen(o => ({ ...o, [sideOf(p)]: p.id }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, dsetLoaded]);
  // 구분 탭을 바꾸면 첫 장부터
  useEffect(() => { resetPages(); }, [effCat]);

  if (!loaded) return <section className="page" />;

  const query = q.trim().toLowerCase();
  const monthKey = `${view.y}-${String(view.m + 1).padStart(2, '0')}`;
  // 내가 쓴 나만보기 일기는 나에게도 보인다 (두 사람이 같이 쓰므로, v2.1)
  const canSee = (p: DiaryPost) => isAdmin || p.visibility === 'public'
    || (p.visibility === 'member' && !!user) || (!!user && p.authorId === user.id);
  const seen = posts.filter(canSee);
  const visible = seen
    .filter(p => effCat === 'all' || (effCat === 'none' ? !p.catId : p.catId === effCat))   // 구분 탭 (v2.1)
    .filter(p => fMood === 'all' || p.moodId === fMood)
    .filter(p => !query || p.title.toLowerCase().includes(query))
    .filter(p => !cols && monthFilter ? p.date.startsWith(monthKey) : true)   // 달 필터는 한 칸(캘린더)일 때만
    .sort(diaryOrder);
  // 「구분 없음」 탭 — 구분 없는 일기가 있을 때만 (v2.1)
  const noneCount = seen.filter(p => !p.catId).length;
  // 쓰기 — 지금 보고 있는 다이어리·구분 탭(·칸의 캐릭터)을 골라 둔 채로 연다 (v2.1)
  const writeHref = (cid?: string) => {
    const qs = new URLSearchParams(secQuery('diary', sec.id).slice(1));
    if (effCat !== 'all' && effCat !== 'none') qs.set('cat', effCat);
    if (cid) qs.set('char', cid);
    const s = qs.toString();
    return `/diary/write${s ? `?${s}` : ''}`;
  };

  // 캘린더 표시용 — 보이는 달의 일기 (일 → 글 목록)
  const byDay = new Map<number, DiaryPost[]>();
  seen.filter(p => p.date.startsWith(monthKey)).forEach(p => {
    const d = parseInt(p.date.slice(8, 10), 10);
    byDay.set(d, [...(byDay.get(d) ?? []), p]);
  });
  const firstDay = new Date(view.y, view.m, 1).getDay();
  const dim = new Date(view.y, view.m + 1, 0).getDate();
  const mv = (d: number) => {
    setView(v => { const nm = v.m + d; return { y: v.y + Math.floor(nm / 12), m: ((nm % 12) + 12) % 12 }; });
    setMonthFilter(true); resetPages();
  };
  const moodOf = (id: string) => moods.find(m => m.id === id);
  const cnt = (mid: string) => seen.filter(p => mid === 'all' || p.moodId === mid).length;

  /** 일기 한 줄 (펼치면 본문 · 수정/삭제) — 칸마다 따로 펼친다 */
  const renderRow = (p: DiaryPost, side: Side) => {
    const m = moodOf(p.moodId);
    const opened = open[side] === p.id;
    return (
      <div key={p.id} id={p.id} className={`dy-row ${opened ? 'open' : ''}`}>
        {/* 접힘: 제목 세로 중앙 / 펼침: 위 정렬 (4.14 v1.8) */}
        <div className="hd" onClick={() => setOpen(o => ({ ...o, [side]: o[side] === p.id ? null : p.id }))}>
          <MoodIcon mood={m} />
          <b className="tt">{p.title}</b>
          {p.visibility !== 'public' && (
            <span className="pill" style={{ flexShrink: 0 }}>{p.visibility === 'member' ? '멤버' : '비공개'}</span>
          )}
          {/* 연동한 탭에서는 누가 썼는지 (v2.1 — 두 사람이 같이 쓰므로) */}
          {linkRel && nickOf(p.authorId) && <small className="au">{nickOf(p.authorId)}</small>}
          <small className="dt">{p.date.replace(/-/g, '.')}{m ? ` · ${m.name}` : ''}</small>
          <span className={`arr ${opened ? 'up' : ''}`} />
        </div>
        {/* 항상 렌더 + grid-rows 트랜지션으로 부드럽게 펼침 (덜컥임 방지) */}
        <div className="dy-fold" aria-hidden={!opened}>
          <div className="dy-fold-in">
            <DiaryBody p={p} onOpen={(ids, idx) => setLb({ srcs: ids, idx })} />
            {canEdit(p) && (
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', padding: '0 0 14px' }}>
                <button className="btn btn-ghost" style={{ padding: '4px 11px', fontSize: 10.5 }}
                  onClick={() => router.push(`/diary/${p.id}/edit`)}>EDIT</button>
                <button className="btn btn-ghost" style={{ padding: '4px 11px', fontSize: 10.5 }}
                  onClick={() => setDelFor(p)}>DELETE</button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  /** 한 칸 — (두 사람 칸이면) 머리: 얼굴(캐릭터)/머리글자(오너)·이름·개수·＋ WRITE + 페이지 */
  const renderCol = (side: Side, col?: Col) => {
    const per = side === 'one' ? PAGE_SIZE : PER_COL;
    const list = side === 'one' ? visible : visible.filter(p => sideOf(p) === side);
    const total = Math.max(1, Math.ceil(list.length / per));
    const cur = Math.min(pages[side], total);
    const shown = list.slice((cur - 1) * per, cur * per);
    const ch = col?.char;
    return (
      <div className="dy-col" key={side}>
        {col && (
          <div className="dy-col-hd">
            {ch ? (
              /* 얼굴을 누르면 캐릭터 페이지로 — AU 탭이면 그 AU 프로필로 */
              <span className="dy-cf go" style={{ background: ch.color || 'var(--line)' }} data-tip={`${ch.name} 프로필`}
                onClick={() => router.push(linkKey ? `${charPath(ch)}?au=${encodeURIComponent(linkKey)}` : charPath(ch))}>
                {ch.thumbId && <CroppedBlobImg fileRef={ch.thumbId} crop={ch.thumbCrop} />}
              </span>
            ) : (
              /* 오너 탭 — 각자 마이페이지에서 정한 프로필 사진 */
              <OwnerFace url={col.avatar} color={col.color} name={col.name} />
            )}
            <b className="nm" style={ch?.fontId ? { fontFamily: familyOf(ch.fontId) } : undefined}>{col.name}</b>
            <small>{list.length}</small>
            {canWriteCol(col) && (
              <button className="btn btn-dark" onClick={() => router.push(writeHref(ch?.id))}>＋ WRITE</button>
            )}
          </div>
        )}
        <div className="panel" style={{ padding: '6px 20px' }}>
          {shown.map(p => renderRow(p, side))}
          {shown.length === 0 && <p className="hint" style={{ padding: 16 }}>{query ? '검색 결과가 없습니다' : '일기가 없습니다'}</p>}
        </div>
        {(side === 'one' || total > 1) && (
          <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center' }}>
            <Pager page={cur} total={total} onChange={n => setPages(s => ({ ...s, [side]: n }))} />
          </div>
        )}
      </div>
    );
  };

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>{sec.id === 'main' ? 'DIARY' : sec.name}</PageTitle>
        <EditableDesc k="diary-desc" def="무드 일기 — 클릭하면 그 자리에서 펼쳐집니다" />
      </div>

      {/* 구분 탭 (v2.1 사용자 요청) — 환경설정 > 다이어리에서 만든 탭 · 「전체」 없이 맨 위 구분이 처음 화면.
          탭 머리(두 사람 칸이 아닐 때): 연동한 자관/AU의 캐릭터(얼굴·이름), 연동하지 않았으면 오너 */}
      {dset.cats.length > 0 && (
        <>
          <div className="seg" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
            {dset.cats.map(c => (
              <button key={c.id} className={effCat === c.id ? 'on' : ''} onClick={() => setFCat(c.id)}>{c.name}</button>
            ))}
            {noneCount > 0 && (
              <button className={effCat === 'none' ? 'on' : ''} onClick={() => setFCat('none')}>구분 없음</button>
            )}
          </div>
          {effCat !== 'none' && !cols && (
            <div className="panel dy-tabhd">
              {linkRel ? (
                <>
                  {linkChars.map(c => (
                    <span key={c.id} className="dy-cf" style={{ background: c.color || 'var(--line)' }} data-tip={`${c.name} 프로필`}
                      onClick={() => router.push(linkKey ? `${charPath(c)}?au=${encodeURIComponent(linkKey)}` : charPath(c))}>
                      {c.thumbId && <CroppedBlobImg fileRef={c.thumbId} crop={c.thumbCrop} />}
                    </span>
                  ))}
                  <div className="nm">
                    <b>{linkAu?.name?.trim() || linkRel.name}{linkAu ? ` · ${linkAu.label}` : ''}</b>
                    <small>{linkChars.map(c => c.name).join(' · ') || '멤버 캐릭터 없음'}</small>
                  </div>
                </>
              ) : (
                <>
                  <OwnerFace url={memberOf(os.l ?? adminId)?.avatarUrl} color={memberOf(os.l ?? adminId)?.avatarColor} name={nickOf(os.l ?? adminId) ?? ownerName ?? '오너'} />
                  <div className="nm">
                    <b>OWNER</b>
                    <small>{(nickOf(os.l ?? adminId) ?? ownerName) ? `${nickOf(os.l ?? adminId) ?? ownerName}의 일기` : '오너의 일기'}</small>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}

      {/* 무드 필터 + 달 필터 표시 + 검색·WRITE — 필터 줄 오른쪽 정렬 (v1.9 사용자 요청).
          두 사람 칸에서는 WRITE가 칸 머리에 있다 */}
      <div className="toolrow" style={{ marginBottom: 16 }}>
        <div className="tag-row">
          <div className={`tag ${fMood === 'all' ? 'on' : ''}`} onClick={() => { setFMood('all'); resetPages(); }}>
            전체 <small>{cnt('all')}</small>
          </div>
          {moods.map(m => (
            <div key={m.id} className={`tag ${fMood === m.id ? 'on' : ''}`} onClick={() => { setFMood(m.id); resetPages(); }}>
              <span style={{ color: m.color }}>{m.icon}</span> {m.name} <small>{cnt(m.id)}</small>
            </div>
          ))}
          {!cols && monthFilter && (
            <div className="tag on" onClick={() => { setMonthFilter(false); resetPages(); }}
              data-tip="달 필터 해제">
              {view.y}.{String(view.m + 1).padStart(2, '0')} ✕
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <SearchBar placeholder="제목 검색" onSearch={v => { setQ(v); resetPages(); }} />
          {!cols && canWriteHere && <button className="btn btn-dark" onClick={() => router.push(writeHref())}>＋ WRITE</button>}
        </div>
      </div>

      {cols ? (
        /* 두 사람 칸 (v2.1) — 왼쪽 | 오른쪽 (캐릭터 탭은 자관 상세와 같은 좌우 · 오너 탭은 오너 | 상대 오너) */
        <div className="dy-split">{renderCol('l', cols[0])}{renderCol('r', cols[1])}</div>
      ) : (
        /* 한 칸 — 좌 리스트 + 우 미니 캘린더 (4.14 달력 보기) */
        <div className="dy-layout">
          {renderCol('one')}

          {/* 우: 미니 캘린더 — 일기 쓴 날은 무드색 점, 달을 넘기면 그 달만 목록에 */}
          <div className="panel dy-cal">
            <div className="hd">
              <button type="button" onClick={() => mv(-1)}>‹</button>
              <b>{view.y}년 {view.m + 1}월</b>
              <button type="button" onClick={() => mv(1)}>›</button>
            </div>
            <div className="wk">{['일', '월', '화', '수', '목', '금', '토'].map(w => <span key={w}>{w}</span>)}</div>
            <div className="days">
              {Array.from({ length: firstDay }, (_, i) => <span key={`e${i}`} />)}
              {Array.from({ length: dim }, (_, i) => {
                const d = i + 1;
                const entries = byDay.get(d);
                return (
                  <button type="button" key={d} className={entries ? 'has' : ''}
                    data-tip={entries ? entries.map(p => p.title).join(' · ') : undefined}
                    onClick={() => {
                      if (!entries) return;
                      setMonthFilter(true); resetPages(); setOpen(o => ({ ...o, one: entries[0].id }));
                    }}>
                    {d}
                    <span className="dots">
                      {(entries ?? []).slice(0, 2).map(p => (
                        <i key={p.id} style={{ background: moodOf(p.moodId)?.color ?? 'var(--faint)' }} />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <ConfirmModal open={delFor !== null} title="일기를 삭제하시겠습니까?"
        body={`"${delFor?.title}" — 삭제하면 복구할 수 없습니다.`}
        onClose={() => setDelFor(null)}
        buttons={[
          { label: 'DELETE', kind: 'accent', onClick: () => { setPosts(posts.filter(x => x.id !== delFor!.id)); setDelFor(null); } },
          { label: 'CANCEL', kind: 'ghost', onClick: () => setDelFor(null) },
        ]} />
      {/* 이미지 뷰어 — 썸네일 클릭 시 (v1.9 사용자 확정) */}
      {lb && <Lightbox srcs={lb.srcs} index={lb.idx} onClose={() => setLb(null)} />}
    </section>
  );
}

/** ?s= 를 읽으므로 Suspense 경계가 필요하다 (Next App Router) */
export default function DiaryPage() {
  return <Suspense fallback={<section className="page" />}><DiaryPageInner /></Suspense>;
}
