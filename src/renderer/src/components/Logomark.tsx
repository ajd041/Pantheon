/** The Power Ring mark (design 9a): a power-button arc enclosing a Greek
 *  temple, with a gold bolt dropping through the gap onto the pediment. */
export default function Logomark({ size = 30 }: { size?: number }) {
  const small = size <= 24
  return (
    <svg viewBox="0 0 52 52" width={size} height={size} aria-hidden="true">
      <path
        d="M16.5 11.55 A19 19 0 1 0 35.5 11.55"
        fill="none" stroke="#2E2233" strokeWidth={small ? 3.4 : 2.6} strokeLinecap="round"
      />
      <path d="M28.8 2l-7.2 10.5h4l-2.6 9.5 7.6-11h-4l2.2-9z" fill="#B8892A" />
      <g
        transform="translate(14,19.75) scale(.5)"
        stroke="#2E2233" strokeWidth={small ? 4.6 : 3.6}
        strokeLinecap="round" strokeLinejoin="round" fill="none"
      >
        <path d="M7 17 24 6l17 11z" />
        <path d="M12 22v13 M20 22v13 M28 22v13 M36 22v13" />
        <path d="M9 38h30 M6 43h36" />
      </g>
    </svg>
  )
}
