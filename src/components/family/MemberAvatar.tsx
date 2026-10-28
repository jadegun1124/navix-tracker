export function MemberAvatar({ name, photo }: { name: string; photo?: string | null }) {
  if (photo) return <img src={photo} alt="" className="h-11 w-11 rounded-full object-cover" />;
  return (
    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#0084FF] text-sm font-black text-white">
      {name.slice(0, 1) || '나'}
    </span>
  );
}
