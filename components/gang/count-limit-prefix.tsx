/** Gray range column, matching Lasting Injuries. Callers decide when `over` is true. */
export function CountLimitPrefix({ text, over }: { text: string; over: boolean }) {
  return (
    <span className={`inline-block w-11 text-center mr-1 ${over ? 'text-red-500' : 'text-gray-400'}`}>
      {text}
    </span>
  );
}
