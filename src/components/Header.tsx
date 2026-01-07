import { Badge } from './ui/badge';

export function Header() {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-yellow-light flex items-center justify-center text-primary font-serif font-bold text-xl">
            D
          </div>
          <div className="flex flex-nowrap items-end gap-1">
            <div className="font-serif text-3xl leading-none">
              Demokratis
            </div>
            <div>
              <div className="m-1 bg-yellow-light text-xs font-semibold rounded font-sans p-1 leading-none text-grey-mid">Beta</div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
