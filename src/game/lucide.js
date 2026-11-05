// SKYBOUND · Lucide icons (ISC) for UI that the game builds as HTML strings.
// Only the icons used are imported, so the bundle stays small. React components use lucide-react.
import { PlaneTakeoff, RefreshCw, History, BookOpen, GraduationCap, Keyboard, Settings, Volume2, VolumeX, Lock, Map, CalendarDays,
  Package, Compass, Mountain, Cloud, Sun, Plane, Eye, EyeOff, Pause, Play, RotateCcw, House, Share2, Download, X, Camera, Fuel, Trophy, Clock,
  Coins, Navigation, Check, ArrowRight, Sparkles, Ship, Flame } from 'lucide';

const ICONS={PlaneTakeoff,RefreshCw,History,BookOpen,GraduationCap,Keyboard,Settings,Volume2,VolumeX,Lock,Map,CalendarDays,Package,Compass,
  Mountain,Cloud,Sun,Plane,Eye,EyeOff,Pause,Play,RotateCcw,House,Share2,Download,X,Camera,Fuel,Trophy,Clock,Coins,Navigation,Check,ArrowRight,Sparkles,Ship,Flame};

const esc=v=>String(v).replace(/"/g,'&quot;');
// lucide('PlaneTakeoff',{size:16,cls:'ic'}) → inline <svg> string (decorative: aria-hidden)
export function lucide(name,{size=16,cls='ic',stroke=2}={}){
  const node=ICONS[name];if(!node)return '';
  const inner=node.map(([tag,attrs])=>`<${tag} ${Object.entries(attrs).map(([k,v])=>`${k}="${esc(v)}"`).join(' ')}/>`).join('');
  return `<svg class="${cls}" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${inner}</svg>`;
}
// Prefix a button's label with an icon, keeping its text (used for buttons whose text the game rewrites).
export function iconButton(el,name,label,opts){if(el)el.innerHTML=`${lucide(name,opts)}<span>${label}</span>`;}
