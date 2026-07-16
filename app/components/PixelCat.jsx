export default function PixelCat({ className = "" }) {
  return (
    <svg className={`pixel-cat ${className}`} viewBox="0 0 32 32" aria-hidden="true" shapeRendering="crispEdges">
      <rect className="cat-glow" x="5" y="4" width="22" height="24" />

      <rect className="cat-outline" x="7" y="7" width="18" height="14" />
      <rect className="cat-outline" x="5" y="11" width="22" height="9" />
      <rect className="cat-outline" x="6" y="5" width="4" height="6" />
      <rect className="cat-outline" x="22" y="5" width="4" height="6" />
      <rect className="cat-outline" x="8" y="3" width="3" height="4" />
      <rect className="cat-outline" x="21" y="3" width="3" height="4" />
      <rect className="cat-outline" x="10" y="20" width="13" height="7" />
      <rect className="cat-outline" x="23" y="20" width="4" height="4" />
      <rect className="cat-outline" x="26" y="16" width="3" height="6" />
      <rect className="cat-outline" x="28" y="14" width="2" height="3" />

      <rect className="cat-face" x="8" y="8" width="16" height="12" />
      <rect className="cat-face" x="6" y="12" width="20" height="7" />
      <rect className="cat-body" x="11" y="21" width="11" height="5" />
      <rect className="cat-body" x="24" y="21" width="2" height="2" />
      <rect className="cat-body" x="27" y="17" width="1" height="4" />

      <rect className="cat-ear-inner" x="8" y="7" width="2" height="3" />
      <rect className="cat-ear-inner" x="22" y="7" width="2" height="3" />
      <rect className="cat-stripe" x="11" y="9" width="1" height="3" />
      <rect className="cat-stripe" x="15" y="8" width="2" height="4" />
      <rect className="cat-stripe" x="20" y="9" width="1" height="3" />

      <rect className="cat-eye" x="10" y="13" width="4" height="1" />
      <rect className="cat-eye" x="11" y="12" width="2" height="3" />
      <rect className="cat-eye-core" x="12" y="13" width="1" height="1" />
      <rect className="cat-eye" x="18" y="13" width="4" height="1" />
      <rect className="cat-eye" x="19" y="12" width="2" height="3" />
      <rect className="cat-eye-core" x="19" y="13" width="1" height="1" />

      <rect className="cat-nose" x="15" y="16" width="2" height="1" />
      <rect className="cat-mouth" x="16" y="17" width="1" height="2" />
      <rect className="cat-whisker" x="2" y="15" width="6" height="1" />
      <rect className="cat-whisker" x="24" y="15" width="6" height="1" />
      <rect className="cat-whisker" x="4" y="18" width="4" height="1" />
      <rect className="cat-whisker" x="24" y="18" width="4" height="1" />
      <rect className="cat-paw" x="12" y="25" width="2" height="2" />
      <rect className="cat-paw" x="19" y="25" width="2" height="2" />
    </svg>
  );
}
