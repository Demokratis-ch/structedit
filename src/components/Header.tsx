export function Header() {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-yellow-light flex items-center justify-center text-primary font-serif font-bold text-xl">
            D
          </div>
          <div className="flex flex-nowrap items-end gap-1 leading-none font-serif">
            <div className="text-3xl">Demokratis</div>
            <div className="text-grey-mid text-3xl font-light">
              &nbsp;&rsaquo;&nbsp;&nbsp;StructEdit
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
