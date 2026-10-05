interface Props {
  level: number;
}

/*
 * 艦載機の熟練度記章を表示するコンポーネント。
 * 熟練度1～7をCSSで描画する棒、斜線、山形の記章パターンに変換する。
 */
function ProficiencyMark({ level }: Props) {
  if (!level || level <= 0) return null;

  const normalizedLevel = Math.min(Math.max(level, 1), 7);
  const variant = normalizedLevel <= 3
    ? 'bars'
    : normalizedLevel <= 6
      ? 'slashes'
      : 'chevrons';
  const markCount = normalizedLevel <= 3
    ? normalizedLevel
    : normalizedLevel <= 6
      ? normalizedLevel - 3
      : 2;

  return (
    <span
      className={`slot-alv alv-${variant}`}
      title={`熟練度 ${level}`}
      role="img"
      aria-label={`熟練度 ${level}`}
    >
      {Array.from({ length: markCount }, (_, index) => (
        <span key={index} className="alv-mark" aria-hidden="true" />
      ))}
    </span>
  );
}

export default ProficiencyMark;
