import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  DndContext, 
  DragOverlay, 
  useDraggable, 
  useDroppable, 
  MouseSensor, 
  TouchSensor, 
  useSensor, 
  useSensors,
  DragStartEvent,
  DragEndEvent
} from '@dnd-kit/core';
import { 
  Undo2, 
  Eraser, 
  ArrowRightLeft, 
  Lightbulb, 
  CheckCircle2,
  Settings,
  ToggleLeft,
  ToggleRight,
  Play,
  RotateCcw,
  ArrowRight,
  Trophy,
  Star,
  Target,
  MessageCircle,
  Lock,
  BarChart3,
  X,
  Eye,
  Grid
} from 'lucide-react';

// --- UTILS ---

const cn = (...classes: (string | undefined | null | false)[]) => {
  return classes.filter(Boolean).join(' ');
};

// --- TYPES ---

type PlaceValue = 'ONES' | 'TENS' | 'HUNDREDS' | 'THOUSANDS';
type GamePhase = 'INTRO' | 'PLAYING' | 'SUCCESS';
type BlockState = 'normal' | 'dragging' | 'ghost' | 'disabled';

interface BoardCounts {
  ones: number;
  tens: number;
  hundreds: number;
  thousands: number;
}

interface Mission {
  id: string;
  target: number;
  title: string;
}

interface HintState {
  level: number;
  targetColumn: PlaceValue | null;
  action: 'ADD' | 'REMOVE' | 'EXCHANGE' | null;
  count: number;
  message: string | null;
}

interface GameSettings {
  maxLevel: 100 | 1000;
  autoExchangeAllowed: boolean;
  hintsAllowed: boolean;
}

interface GameStats {
  missionsCompleted: number;
  hintsUsed: number;
}

// --- DATA (MISSIONS) ---

const ALL_MISSIONS: Mission[] = [
  { id: 'M01', target: 12, title: 'Construis le nombre 12' },
  { id: 'M02', target: 30, title: 'Construis le nombre 30' },
  { id: 'M03', target: 47, title: 'Construis le nombre 47' },
  { id: 'M04', target: 90, title: 'Attention au zéro ! Construis 90' },
  { id: 'M05', target: 100, title: 'Le passage à la centaine : 100' },
  { id: 'M06', target: 205, title: 'Construis le nombre 205' },
  { id: 'M07', target: 347, title: 'Un grand nombre : 347' },
  { id: 'M08', target: 410, title: 'Construis le nombre 410' },
  { id: 'M09', target: 999, title: 'Le plus grand nombre à 3 chiffres : 999' },
  { id: 'M10', target: 1000, title: 'Mission Finale : 1000 !' },
];

const DEFAULT_SETTINGS: GameSettings = {
  maxLevel: 1000,
  autoExchangeAllowed: true,
  hintsAllowed: true
};

const DEFAULT_STATS: GameStats = {
  missionsCompleted: 0,
  hintsUsed: 0
};

// --- MATH LOGIC ---

const calculateTotal = (counts: BoardCounts): number => {
  return (
    counts.ones +
    counts.tens * 10 +
    counts.hundreds * 100 +
    counts.thousands * 1000
  );
};

const calculateDecomposition = (counts: BoardCounts): number[] => {
  const parts: number[] = [];
  if (counts.thousands > 0) parts.push(counts.thousands * 1000);
  if (counts.hundreds > 0) parts.push(counts.hundreds * 100);
  if (counts.tens > 0) parts.push(counts.tens * 10);
  if (counts.ones > 0) parts.push(counts.ones);
  return parts;
};

const canExchange = (counts: BoardCounts): boolean => {
  return counts.ones >= 10 || counts.tens >= 10 || counts.hundreds >= 10;
};

const performExchange = (counts: BoardCounts): BoardCounts => {
  const newCounts = { ...counts };
  if (newCounts.ones >= 10) { newCounts.ones -= 10; newCounts.tens += 1; }
  else if (newCounts.tens >= 10) { newCounts.tens -= 10; newCounts.hundreds += 1; }
  else if (newCounts.hundreds >= 10) { newCounts.hundreds -= 10; newCounts.thousands += 1; }
  return newCounts;
};

const performCascadeExchange = (counts: BoardCounts): BoardCounts => {
  let current = { ...counts };
  let safety = 0;
  while (canExchange(current) && safety < 50) {
    current = performExchange(current);
    safety++;
  }
  return current;
};

// --- HINT LOGIC ---

const getHint = (counts: BoardCounts, target: number): Omit<HintState, 'level'> => {
  const currentTotal = calculateTotal(counts);
  const diff = target - currentTotal;
  const absDiff = Math.abs(diff);

  if (diff === 0) return { targetColumn: null, action: null, count: 0, message: "C'est correct !" };

  let column: PlaceValue = 'ONES';
  let unitValue = 1;
  
  if (absDiff >= 1000) { column = 'THOUSANDS'; unitValue = 1000; }
  else if (absDiff >= 100) { column = 'HUNDREDS'; unitValue = 100; }
  else if (absDiff >= 10) { column = 'TENS'; unitValue = 10; }
  
  const countNeeded = Math.floor(absDiff / unitValue);
  const action = diff > 0 ? 'ADD' : 'REMOVE';

  let message = "";
  const colName = column === 'ONES' ? 'unités' : column === 'TENS' ? 'dizaines' : column === 'HUNDREDS' ? 'centaines' : 'milliers';
  
  if (action === 'ADD') message = `Ajoute ${countNeeded} ${colName}.`;
  else message = `Enlève ${countNeeded} ${colName}.`;

  return { targetColumn: column, action, count: countNeeded, message };
};

// --- HOOKS ---

const INITIAL_COUNTS: BoardCounts = { ones: 0, tens: 0, hundreds: 0, thousands: 0 };

const useBoard = (target: number, settings: GameSettings, onStatsUpdate: (type: 'hint') => void) => {
  const [counts, setCounts] = useState<BoardCounts>(INITIAL_COUNTS);
  const [history, setHistory] = useState<BoardCounts[]>([]);
  const [autoExchange, setAutoExchange] = useState(false);
  const [hintState, setHintState] = useState<HintState>({ level: 0, targetColumn: null, action: null, count: 0, message: null });

  useEffect(() => {
    if (hintState.level > 0) {
      setHintState(prev => ({ ...prev, level: 0, message: null }));
    }
  }, [counts]);

  useEffect(() => {
    if (!settings.autoExchangeAllowed) {
      setAutoExchange(false);
    }
  }, [settings.autoExchangeAllowed]);

  const total = calculateTotal(counts);
  const decomposition = calculateDecomposition(counts);
  const isExchangePossible = canExchange(counts);

  const updateCountsWithHistory = (newCounts: BoardCounts) => {
    setHistory(prev => [...prev, counts]);
    setCounts(newCounts);
  };

  const addBlock = (type: PlaceValue) => {
    const key = type.toLowerCase() as keyof BoardCounts;
    const nextCounts = { ...counts, [key]: counts[key] + 1 };
    
    let finalCounts = nextCounts;
    if (autoExchange && canExchange(nextCounts)) {
       finalCounts = performCascadeExchange(nextCounts);
    }

    updateCountsWithHistory(finalCounts);
  };

  const removeBlock = (type: PlaceValue) => {
    const key = type.toLowerCase() as keyof BoardCounts;
    if (counts[key] <= 0) return;
    
    const nextCounts = { ...counts, [key]: counts[key] - 1 };
    updateCountsWithHistory(nextCounts);
  };

  const clearBoard = () => {
    updateCountsWithHistory(INITIAL_COUNTS);
    setHintState({ level: 0, targetColumn: null, action: null, count: 0, message: null });
  };

  const exchangeBlock = () => {
    if (isExchangePossible) {
      updateCountsWithHistory(performExchange(counts));
    }
  };

  const undo = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setHistory(prev => prev.slice(0, -1));
    setCounts(previous);
  };

  const toggleAutoExchange = () => {
    if (!settings.autoExchangeAllowed) return;
    setAutoExchange(prev => {
      const nextMode = !prev;
      if (nextMode) {
        const newCounts = performCascadeExchange(counts);
        if (calculateTotal(newCounts) === calculateTotal(counts) && newCounts !== counts) {
             updateCountsWithHistory(newCounts);
        }
      }
      return nextMode;
    });
  };

  const incrementHintLevel = () => {
    if (!settings.hintsAllowed) return;
    const calculation = getHint(counts, target);
    setHintState(prev => {
      const nextLevel = Math.min(prev.level + 1, 3);
      if (nextLevel > prev.level) onStatsUpdate('hint');
      return { ...calculation, level: nextLevel };
    });
  };

  const showFeedbackError = () => {
    const calculation = getHint(counts, target);
    setHintState({ ...calculation, level: 1 });
  };

  return {
    counts,
    total,
    decomposition,
    isExchangePossible,
    autoExchange,
    hintState,
    canUndo: history.length > 0,
    addBlock,
    removeBlock,
    clearBoard,
    exchangeBlock,
    undo,
    toggleAutoExchange,
    incrementHintLevel,
    showFeedbackError
  };
};

// --- COMPONENTS ---

// 1. BlockVisual (SVG COMPONENTS - HAUTE FIDELITÉ RECRÉÉE)

interface BlockVisualProps {
  type: PlaceValue;
  className?: string;
  state?: BlockState;
  size?: number;
}

const BlockVisual: React.FC<BlockVisualProps> = ({ type, className, state = 'normal', size }) => {
  const isGhost = state === 'ghost';
  const isDragging = state === 'dragging';
  const isDisabled = state === 'disabled';

  // Couleurs Officielles (Montessori)
  const colors = {
    thousands: { fill: '#EF4444', side: '#B91C1C', top: '#FCA5A5', stroke: '#7F1D1D' }, // Rouge
    hundreds:  { fill: '#22C55E', side: '#15803D', top: '#86EFAC', stroke: '#14532D' }, // Vert
    tens:      { fill: '#3B82F6', side: '#1E40AF', top: '#93C5FD', stroke: '#1E3A8A' }, // Bleu
    ones:      { fill: '#FACC15', side: '#CA8A04', top: '#FEF08A', stroke: '#854D0E' }, // Jaune
  };

  const opacity = isGhost ? 0.4 : (isDragging ? 0.9 : 1);
  const strokeWidth = isGhost ? 1.5 : 0.8; 
  const strokeDash = isGhost ? "3 3" : "none";
  const fillOpacity = isGhost ? 0 : 1;

  // Common SVG container
  const SVGWrapper = ({ children, viewBox = "0 0 100 100" }: { children: React.ReactNode, viewBox?: string }) => (
    <svg viewBox={viewBox} className="w-full h-full overflow-visible" style={{ filter: isDragging ? 'drop-shadow(0px 8px 8px rgba(0,0,0,0.25))' : 'none' }}>
      <g strokeLinejoin="round" strokeLinecap="round" opacity={opacity}>
        {children}
      </g>
    </svg>
  );

  const style = size ? { width: size, height: size } : {};

  return (
    <div 
      className={cn(
        "relative transition-transform select-none flex items-center justify-center",
        isDragging && "scale-110 z-50",
        isDisabled && "grayscale opacity-50",
        className
      )}
      style={style}
    >
      <SVGWrapper>
        {type === 'ONES' && (
          <g>
            {/* Cube 1 (Jaune) */}
            {/* Face Supérieure */}
            <path d="M25 35 L40 20 L80 20 L65 35 Z" fill={colors.ones.top} fillOpacity={fillOpacity} stroke={colors.ones.stroke} strokeWidth={strokeWidth} strokeDasharray={strokeDash}/>
            {/* Face Latérale Droite */}
            <path d="M65 35 L80 20 L80 60 L65 75 Z" fill={colors.ones.side} fillOpacity={fillOpacity} stroke={colors.ones.stroke} strokeWidth={strokeWidth} strokeDasharray={strokeDash}/>
            {/* Face Avant */}
            <rect x="25" y="35" width="40" height="40" fill={colors.ones.fill} fillOpacity={fillOpacity} stroke={colors.ones.stroke} strokeWidth={strokeWidth} strokeDasharray={strokeDash}/>
          </g>
        )}

        {type === 'TENS' && (
          <g>
            {/* Barre 10 (Bleue) - Verticale */}
            {/* Face Supérieure */}
            <path d="M35 15 L50 5 L65 5 L50 15 Z" fill={colors.tens.top} fillOpacity={fillOpacity} stroke={colors.tens.stroke} strokeWidth={strokeWidth} strokeDasharray={strokeDash}/>
            {/* Face Latérale Droite */}
            <path d="M50 15 L65 5 L65 85 L50 95 Z" fill={colors.tens.side} fillOpacity={fillOpacity} stroke={colors.tens.stroke} strokeWidth={strokeWidth} strokeDasharray={strokeDash}/>
            {/* Face Avant */}
            <rect x="35" y="15" width="15" height="80" fill={colors.tens.fill} fillOpacity={fillOpacity} stroke={colors.tens.stroke} strokeWidth={strokeWidth} strokeDasharray={strokeDash}/>
            
            {/* Segments (9 traits pour faire 10 unités) */}
            {!isGhost && Array.from({length: 9}).map((_,i) => {
              const y = 15 + (i+1)*8;
              return (
                <React.Fragment key={i}>
                  {/* Trait Avant */}
                  <line x1="35" y1={y} x2="50" y2={y} stroke={colors.tens.stroke} strokeWidth="0.5" opacity="0.6"/>
                  {/* Trait Côté (perspective) */}
                  <line x1="50" y1={y} x2="65" y2={y-10} stroke={colors.tens.stroke} strokeWidth="0.5" opacity="0.6"/>
                </React.Fragment>
              )
            })}
          </g>
        )}

        {type === 'HUNDREDS' && (
          <g>
            {/* Plaque 100 (Verte) - 10x10 Plat */}
            {/* Face Supérieure (Fine) */}
            <path d="M15 20 L20 15 L90 15 L85 20 Z" fill={colors.hundreds.top} fillOpacity={fillOpacity} stroke={colors.hundreds.stroke} strokeWidth={strokeWidth} strokeDasharray={strokeDash}/>
            {/* Face Latérale Droite (Fine) */}
            <path d="M85 20 L90 15 L90 85 L85 90 Z" fill={colors.hundreds.side} fillOpacity={fillOpacity} stroke={colors.hundreds.stroke} strokeWidth={strokeWidth} strokeDasharray={strokeDash}/>
            {/* Face Avant (Grand Carré) */}
            <rect x="15" y="20" width="70" height="70" fill={colors.hundreds.fill} fillOpacity={fillOpacity} stroke={colors.hundreds.stroke} strokeWidth={strokeWidth} strokeDasharray={strokeDash}/>
            
            {/* Grille 10x10 */}
            {!isGhost && (
              <g stroke={colors.hundreds.stroke} strokeWidth="0.5" opacity="0.4">
                {Array.from({length: 9}).map((_,i) => (
                  <React.Fragment key={i}>
                    {/* Lignes Verticales */}
                    <line x1={15 + (i+1)*7} y1={20} x2={15 + (i+1)*7} y2={90} />
                    {/* Lignes Horizontales */}
                    <line x1={15} y1={20 + (i+1)*7} x2={85} y2={20 + (i+1)*7} />
                  </React.Fragment>
                ))}
              </g>
            )}
          </g>
        )}

        {type === 'THOUSANDS' && (
          <g>
            {/* Cube 1000 (Rouge) - 10x10x10 Massif */}
            {/* Face Latérale Droite */}
            <path d="M70 30 L90 10 L90 70 L70 90 Z" fill={colors.thousands.side} fillOpacity={fillOpacity} stroke={colors.thousands.stroke} strokeWidth={strokeWidth} strokeDasharray={strokeDash}/>
            {/* Face Supérieure */}
            <path d="M10 30 L30 10 L90 10 L70 30 Z" fill={colors.thousands.top} fillOpacity={fillOpacity} stroke={colors.thousands.stroke} strokeWidth={strokeWidth} strokeDasharray={strokeDash}/>
            {/* Face Avant */}
            <rect x="10" y="30" width="60" height="60" fill={colors.thousands.fill} fillOpacity={fillOpacity} stroke={colors.thousands.stroke} strokeWidth={strokeWidth} strokeDasharray={strokeDash}/>
            
            {/* Grilles Détaillées sur les 3 faces */}
            {!isGhost && (
              <g stroke={colors.thousands.stroke} strokeWidth="0.5" opacity="0.3">
                {Array.from({length: 9}).map((_,i) => {
                  const step = (i+1)*6;
                  return (
                    <React.Fragment key={i}>
                      {/* Grille Face Avant */}
                      <line x1={10 + step} y1={30} x2={10 + step} y2={90} />
                      <line x1={10} y1={30 + step} x2={70} y2={30 + step} />
                      
                      {/* Grille Face Supérieure (Perspective) */}
                      {/* Lignes X */}
                      <line x1={10 + (i+1)*2} y1={30 - (i+1)*2} x2={70 + (i+1)*2} y2={30 - (i+1)*2} />
                      {/* Lignes Profondeur */}
                      <line x1={10 + step} y1={30} x2={30 + step} y2={10} />

                      {/* Grille Face Latérale (Perspective) */}
                      {/* Lignes Y */}
                      <line x1={70 + (i+1)*2} y1={30 - (i+1)*2} x2={70 + (i+1)*2} y2={90 - (i+1)*2} />
                      {/* Lignes Profondeur */}
                      <line x1={70} y1={30 + step} x2={90} y2={10 + step} />
                    </React.Fragment>
                  );
                })}
              </g>
            )}
          </g>
        )}
      </SVGWrapper>
    </div>
  );
};

// 2. Draggable Palette Item
const DraggableSource: React.FC<{ type: PlaceValue; label: string }> = ({ type, label }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `source-${type}`,
    data: { type }
  });

  return (
    <div 
      ref={setNodeRef} 
      {...listeners} 
      {...attributes}
      className={cn("flex flex-col items-center gap-2 cursor-grab active:cursor-grabbing touch-none transition-opacity", isDragging ? 'opacity-30' : 'opacity-100')}
    >
      <div className="w-14 h-14 md:w-16 md:h-16 flex items-center justify-center bg-slate-50 rounded-lg border border-slate-100 p-2 hover:bg-slate-100 transition-colors">
        <BlockVisual type={type} className="w-full h-full" />
      </div>
      <span className="text-xs font-bold text-slate-600 select-none">{label}</span>
    </div>
  );
};

const Palette: React.FC = () => {
  return (
    <div className="h-full bg-white border-r border-slate-200 p-2 md:p-4 flex flex-col items-center gap-6 shadow-sm overflow-y-auto z-20 relative">
      <h2 className="text-[10px] md:text-sm font-bold text-slate-500 uppercase tracking-wider mb-2 select-none">Blocs</h2>
      <DraggableSource type="THOUSANDS" label="1000" />
      <DraggableSource type="HUNDREDS" label="100" />
      <DraggableSource type="TENS" label="10" />
      <DraggableSource type="ONES" label="1" />
    </div>
  );
};

// 3. Chart Columns
const DroppableColumn: React.FC<{ 
  type: PlaceValue; 
  title: string; 
  color: string; 
  count: number;
  hintState: HintState; 
}> = ({ type, title, color, count, hintState }) => {
  const { setNodeRef, isOver } = useDroppable({ id: `drop-${type}`, data: { type } });

  const prevCountRef = useRef(count);
  const [animClass, setAnimClass] = useState('');

  const isHintTarget = hintState.targetColumn === type;
  const isHintLevel1 = isHintTarget && hintState.level >= 1;
  const isHintLevel2 = isHintTarget && hintState.level >= 2 && hintState.action === 'ADD';

  useEffect(() => {
    const prev = prevCountRef.current;
    if (count !== prev) {
      if (prev - count >= 10) {
        setAnimClass('animate-[ping_0.3s_ease-out_reverse]');
      } else if (count - prev === 1 && count > prev) {
         setAnimClass('animate-[bounce_0.4s_ease-in-out]'); 
      }
      const timer = setTimeout(() => setAnimClass(''), 500);
      prevCountRef.current = count;
      return () => clearTimeout(timer);
    }
  }, [count]);

  const multiplier = type === 'ONES' ? 1 : type === 'TENS' ? 10 : type === 'HUNDREDS' ? 100 : 1000;

  const renderBlocks = () => {
    return Array.from({ length: Math.min(count, 100) }).map((_, i) => (
      <BlockVisual 
        key={`real-${i}`} 
        type={type} 
        className={cn(
          "animate-in fade-in zoom-in duration-300",
          type === 'THOUSANDS' ? "w-12 h-12" :
          type === 'HUNDREDS' ? "w-12 h-12" :
          type === 'TENS' ? "w-4 h-12" : // Barre plus fine pour qu'elle s'empile bien
          "w-6 h-6"
        )} 
      />
    ));
  };

  return (
    <div 
      ref={setNodeRef}
      className={cn(
        "flex-1 flex flex-col border-r border-slate-200 last:border-r-0 relative transition-all duration-300",
        color,
        isOver ? "ring-4 ring-inset ring-indigo-400/50 bg-white/60" : "",
        isHintLevel1 ? "ring-4 ring-inset ring-yellow-400 bg-yellow-50" : "" 
      )}
    >
      <div className={cn("p-2 md:p-3 text-center border-b border-slate-200/50 bg-white/50 backdrop-blur-sm select-none", isHintLevel1 && "bg-yellow-200")}>
        <h3 className={cn("text-xs md:text-sm font-black text-slate-600 tracking-widest", isHintLevel1 && "text-yellow-800")}>{title}</h3>
      </div>

      <div className="flex-1 p-2 relative overflow-hidden overflow-y-auto min-h-[120px]">
        {count === 0 && !isOver && !isHintLevel2 && (
          <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none select-none">
            <span className="text-4xl md:text-6xl font-black text-slate-400">{title[0]}</span>
          </div>
        )}
        
        <div className={cn("flex flex-wrap content-start gap-1 p-1 transition-all", animClass)}>
          {renderBlocks()}
          
          {isHintLevel2 && Array.from({ length: Math.min(hintState.count, 5) }).map((_, i) => (
             <BlockVisual key={`ghost-${i}`} type={type} state="ghost" className="w-8 h-8 animate-pulse" />
          ))}

          {count > 100 && (
            <div className="w-8 h-8 flex items-center justify-center bg-slate-200 rounded-full text-xs font-bold text-slate-600">+{count - 100}</div>
          )}
        </div>
      </div>

      <div className="p-3 md:p-4 border-t border-slate-200/50 bg-white/80 backdrop-blur text-center select-none z-10 relative">
        <div className={cn("text-2xl md:text-3xl font-bold font-mono transition-transform", isOver ? "scale-110 text-indigo-600" : "text-slate-700")}>
          {count}
        </div>
        <div className="text-[10px] md:text-xs text-slate-400 font-mono mt-1">Val: {count * multiplier}</div>
      </div>
    </div>
  );
};

const PlaceValueChart: React.FC<{ counts: BoardCounts; hintState: HintState }> = ({ counts, hintState }) => {
  return (
    <div className="flex-1 bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden flex flex-row h-full">
      <DroppableColumn type="THOUSANDS" title="MILLIERS" color="bg-green-50" count={counts.thousands} hintState={hintState} />
      <DroppableColumn type="HUNDREDS" title="CENTAINES" color="bg-red-50" count={counts.hundreds} hintState={hintState} />
      <DroppableColumn type="TENS" title="DIZAINES" color="bg-blue-50" count={counts.tens} hintState={hintState} />
      <DroppableColumn type="ONES" title="UNITÉS" color="bg-yellow-50" count={counts.ones} hintState={hintState} />
    </div>
  );
};

// 4. Action Panel
interface ActionPanelProps {
  onClear: () => void;
  onExchange: () => void;
  onCheck: () => void;
  onHint: () => void;
  onUndo: () => void;
  canExchange: boolean;
  canCheck: boolean;
  canUndo: boolean;
  hintLevel: number;
  settings: GameSettings;
}

const ActionButton: React.FC<{ 
  icon: React.ReactNode; 
  label: string; 
  onClick?: () => void; 
  primary?: boolean; 
  color?: string; 
  disabled?: boolean; 
  animate?: boolean; 
  shake?: boolean;
  active?: boolean;
}> = 
  ({ icon, label, onClick, primary, color = "bg-white", disabled, animate, shake, active }) => (
  <button 
    onClick={onClick}
    disabled={disabled}
    className={cn(
      "w-full p-3 md:p-4 rounded-xl shadow-sm border border-slate-200", 
      "flex flex-col items-center gap-2 transition-all active:scale-95",
      "disabled:opacity-50 disabled:cursor-not-allowed",
      primary ? 'bg-indigo-600 text-white border-indigo-700 hover:bg-indigo-700' : `${color} text-slate-600 hover:bg-slate-50`,
      !disabled && animate ? 'animate-pulse ring-2 ring-orange-300' : '',
      shake ? 'animate-[shake_0.5s_ease-in-out]' : '',
      active ? 'ring-2 ring-yellow-400 bg-yellow-50' : ''
    )}
    style={shake ? { animation: 'shake 0.5s cubic-bezier(.36,.07,.19,.97) both' } : {}}
  >
    {icon}
    <span className="text-[10px] md:text-xs font-bold uppercase">{label}</span>
  </button>
);

const ActionPanel: React.FC<ActionPanelProps> = ({ onClear, onExchange, onCheck, onHint, onUndo, canExchange, canCheck, canUndo, hintLevel, settings }) => {
  return (
    <div className="w-20 md:w-32 bg-slate-100 p-2 flex flex-col gap-3 h-full overflow-y-auto border-l border-slate-200">
      <div className="flex flex-col gap-2 mt-auto">
        <ActionButton icon={<Undo2 size={20} />} label="Annuler" onClick={onUndo} disabled={!canUndo} />
        <ActionButton icon={<Eraser size={20} />} label="Effacer" onClick={onClear} />
      </div>

      <div className="my-2 border-t border-slate-300 w-full opacity-50"></div>

      <ActionButton 
        icon={<ArrowRightLeft size={20} />} 
        label="Échange" 
        color="bg-orange-100" 
        onClick={onExchange}
        disabled={!canExchange}
        animate={canExchange} 
      />
      
      {settings.hintsAllowed ? (
        <ActionButton 
          icon={<Lightbulb size={20} className={hintLevel > 0 ? "fill-yellow-400 text-yellow-600" : ""} />} 
          label={hintLevel > 0 ? `Indice (${hintLevel})` : "Indice"} 
          color="bg-yellow-100" 
          onClick={onHint}
          active={hintLevel > 0}
        />
      ) : (
        <div className="h-14 md:h-[4.5rem] w-full border border-slate-100 rounded-xl bg-slate-50 flex items-center justify-center opacity-50">
          <Lightbulb size={20} className="text-slate-300" />
        </div>
      )}
      
      <div className="mt-auto">
        <ActionButton 
          icon={<CheckCircle2 size={24} />} 
          label="Valider" 
          primary 
          disabled={!canCheck} 
          onClick={onCheck}
        />
      </div>
    </div>
  );
};

// 5. Result Display
const ResultDisplay: React.FC<{ total: number; decomposition: number[]; target?: number }> = ({ total, decomposition, target }) => {
  return (
    <div className="bg-slate-900 text-white p-4 flex items-center justify-between shadow-lg z-10 transition-colors duration-500">
      <div className="flex items-baseline gap-4">
        <span className="text-slate-400 text-xs md:text-sm uppercase font-bold tracking-wider">Total</span>
        <span className="text-3xl md:text-4xl font-mono font-bold text-white transition-all">
          {total}
        </span>
      </div>

      <div className="hidden md:flex items-center gap-2 px-6 py-2 bg-slate-800 rounded-full shadow-inner">
        {decomposition.length === 0 ? (
          <span className="text-slate-600 font-mono text-sm">0</span>
        ) : (
          decomposition.map((val, index) => (
            <React.Fragment key={index}>
              {index > 0 && <span className="text-slate-500 font-bold">+</span>}
              <span className={cn(
                "font-mono text-xl font-bold",
                val >= 1000 ? 'text-green-400' : 
                val >= 100 ? 'text-red-400' : 
                val >= 100 ? 'text-blue-400' : 'text-yellow-400'
              )}>
                {val}
              </span>
            </React.Fragment>
          ))
        )}
      </div>

      <div className="bg-indigo-600 px-3 py-1 rounded flex items-center gap-2">
        <Target size={14} className="text-indigo-200"/>
        <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider">
          Objectif: <span className="text-white text-sm ml-1">{target}</span>
        </span>
      </div>
    </div>
  );
};

// 6. Screens 
const MissionIntro: React.FC<{ mission: Mission; onStart: () => void }> = ({ mission, onStart }) => (
  <div className="absolute inset-0 z-40 bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-4">
    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in duration-300">
      <div className="bg-indigo-600 p-6 flex justify-center">
        <div className="w-20 h-20 bg-indigo-500 rounded-full flex items-center justify-center shadow-inner">
          <Target className="text-white w-10 h-10" />
        </div>
      </div>
      <div className="p-8 text-center">
        <h2 className="text-sm font-bold text-indigo-600 uppercase tracking-widest mb-2">Mission {mission.id}</h2>
        <h1 className="text-3xl font-black text-slate-800 mb-4">{mission.title}</h1>
        <p className="text-slate-500 mb-8">Utilise les blocs pour construire le nombre <strong>{mission.target}</strong> dans le tableau.</p>
        <button onClick={onStart} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 px-6 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 text-lg">
          <Play fill="currentColor" /> Commencer
        </button>
      </div>
    </div>
  </div>
);

const SuccessScreen: React.FC<{ mission: Mission; onNext: () => void; onReplay: () => void; isLast: boolean }> = ({ mission, onNext, onReplay, isLast }) => (
  <div className="absolute inset-0 z-40 bg-green-900/90 backdrop-blur-sm flex items-center justify-center p-4">
    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in duration-300 relative">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-10 left-10 w-4 h-4 bg-red-400 rounded-full animate-bounce"></div>
        <div className="absolute top-20 right-20 w-3 h-3 bg-blue-400 rounded-full animate-pulse"></div>
        <div className="absolute bottom-10 left-1/2 w-5 h-5 bg-yellow-400 rounded-full animate-spin"></div>
      </div>
      <div className="bg-green-500 p-8 flex flex-col items-center">
        <Trophy className="text-yellow-300 w-24 h-24 drop-shadow-lg mb-2" />
        <div className="flex gap-1">
          <Star className="text-yellow-300 fill-yellow-300 w-8 h-8" />
          <Star className="text-yellow-300 fill-yellow-300 w-10 h-10 -mt-2" />
          <Star className="text-yellow-300 fill-yellow-300 w-8 h-8" />
        </div>
      </div>
      <div className="p-8 text-center">
        <h2 className="text-2xl font-black text-green-600 mb-2">Bravo !</h2>
        <p className="text-slate-600 mb-6">Tu as construit le nombre <strong>{mission.target}</strong>.</p>
        <div className="flex flex-col gap-3">
          {!isLast ? (
            <button onClick={onNext} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95">
              Mission Suivante <ArrowRight />
            </button>
          ) : (
            <div className="p-4 bg-yellow-50 text-yellow-800 rounded-lg font-bold border border-yellow-200">🎉 Jeu terminé ! Tu es un champion !</div>
          )}
          <button onClick={onReplay} className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3 px-6 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95">
            <RotateCcw size={18} /> Rejouer
          </button>
        </div>
      </div>
    </div>
  </div>
);

const HintBubble: React.FC<{ message: string }> = ({ message }) => (
  <div className="absolute bottom-20 right-4 md:right-32 z-40 animate-in slide-in-from-bottom-5 fade-in duration-300">
    <div className="bg-yellow-400 text-yellow-900 px-4 py-3 rounded-xl shadow-lg border-2 border-yellow-500 font-bold flex items-center gap-3 max-w-[200px] md:max-w-xs relative">
      <MessageCircle className="w-6 h-6 shrink-0" />
      <span className="text-sm">{message}</span>
      <div className="absolute -bottom-2 right-8 w-4 h-4 bg-yellow-400 border-b-2 border-r-2 border-yellow-500 rotate-45"></div>
    </div>
  </div>
);

// 7. Asset Preview (Debug Updated)
const AssetPreview: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [debugMode, setDebugMode] = useState(true);

  // Helper for debug box
  const DebugBox = ({ size, children }: { size: number, children: React.ReactNode }) => (
    <div 
      style={{ width: size, height: size }} 
      className={cn(
        "relative flex items-center justify-center shrink-0",
        debugMode ? "border border-slate-300 bg-slate-50" : ""
      )}
    >
      {debugMode && <div className="absolute inset-0 opacity-10 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:8px_8px]"></div>}
      <div className={cn("w-full h-full", debugMode ? "border border-red-500/30" : "")}>
        {children}
      </div>
    </div>
  );

  return (
    <div className="absolute inset-0 z-50 bg-white overflow-y-auto p-8 font-sans">
      <div className="flex justify-between items-center mb-8 sticky top-0 bg-white/90 backdrop-blur pb-4 border-b border-slate-100 z-10">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-slate-800">Preview des Assets (SVG)</h1>
          <button 
            onClick={() => setDebugMode(!debugMode)}
            className={cn("px-3 py-1 rounded text-sm font-bold border", debugMode ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "bg-slate-50 border-slate-200")}
          >
            {debugMode ? "Debug: ON" : "Debug: OFF"}
          </button>
        </div>
        <button onClick={onClose} className="p-2 bg-slate-200 rounded hover:bg-slate-300"><X /></button>
      </div>
      
      <div className="max-w-5xl mx-auto space-y-12 pb-20">
        {/* Scale Comparison Section */}
        <section className="border p-6 rounded-xl bg-slate-50">
          <h2 className="font-bold mb-6 text-slate-500 uppercase tracking-wider flex items-center gap-2">
            <Grid size={16}/> Comparaison d'échelle (48px)
          </h2>
          <div className="flex flex-wrap items-end gap-8 justify-center">
            {['ONES', 'TENS', 'HUNDREDS', 'THOUSANDS'].map((t) => (
              <div key={t} className="flex flex-col items-center gap-2">
                <DebugBox size={48}>
                  <BlockVisual type={t as PlaceValue} size={48} />
                </DebugBox>
                <div className="text-xs font-mono text-slate-400">{t}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Detailed Rows */}
        <div className="grid grid-cols-1 gap-8">
          {[
            { type: 'ONES', label: '1 (Cube Jaune)' },
            { type: 'TENS', label: '10 (Barre Bleue)' },
            { type: 'HUNDREDS', label: '100 (Plaque Verte)' },
            { type: 'THOUSANDS', label: '1000 (Cube Rouge)' }
          ].map((item) => (
            <div key={item.type} className="border p-6 rounded-xl bg-white shadow-sm">
              <h2 className="font-bold mb-6 text-slate-800">{item.label}</h2>
              <div className="flex flex-wrap items-end gap-12">
                <div className="flex flex-col items-center gap-2">
                  <DebugBox size={24}>
                    <BlockVisual type={item.type as PlaceValue} size={24} />
                  </DebugBox>
                  <span className="text-xs text-slate-400 font-mono">24px</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <DebugBox size={48}>
                    <BlockVisual type={item.type as PlaceValue} size={48} />
                  </DebugBox>
                  <span className="text-xs text-slate-400 font-mono">48px</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <DebugBox size={72}>
                    <BlockVisual type={item.type as PlaceValue} size={72} />
                  </DebugBox>
                  <span className="text-xs text-slate-400 font-mono">72px</span>
                </div>
                {/* Ghost State */}
                <div className="flex flex-col items-center gap-2 ml-8 border-l pl-8">
                  <DebugBox size={48}>
                    <BlockVisual type={item.type as PlaceValue} size={48} state="ghost" />
                  </DebugBox>
                  <span className="text-xs text-slate-400 font-mono">Ghost</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// 8. Parent Mode Components

const GatekeeperModal: React.FC<{ onSuccess: () => void; onClose: () => void }> = ({ onSuccess, onClose }) => {
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (answer.trim() === '7') {
      onSuccess();
    } else {
      setError(true);
      setAnswer('');
    }
  };

  return (
    <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in duration-200">
        <div className="bg-slate-800 p-4 flex items-center justify-between">
          <h2 className="text-white font-bold flex items-center gap-2">
            <Lock size={18} /> Accès Parent
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={20}/></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6">
          <p className="text-slate-600 mb-4 text-sm">Veuillez résoudre ce calcul pour prouver que vous êtes un parent :</p>
          <div className="text-center mb-6">
            <span className="text-3xl font-black text-slate-800">3 + 4 = ?</span>
          </div>
          <input 
            type="number" 
            autoFocus
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            className={cn(
              "w-full text-center text-2xl font-bold py-2 border-2 rounded-lg mb-4 outline-none focus:ring-2",
              error ? "border-red-400 bg-red-50 focus:ring-red-200" : "border-slate-200 focus:border-indigo-500 focus:ring-indigo-200"
            )}
            placeholder="Réponse"
          />
          <button type="submit" className="w-full bg-slate-800 text-white font-bold py-3 rounded-lg hover:bg-slate-700 transition-colors">
            Valider
          </button>
        </form>
      </div>
    </div>
  );
};

const ParentSettingsModal: React.FC<{ 
  settings: GameSettings; 
  stats: GameStats; 
  onUpdateSettings: (s: GameSettings) => void; 
  onClose: () => void; 
  onReset: () => void;
}> = ({ settings, stats, onUpdateSettings, onClose, onReset }) => {
  
  const toggle = (key: keyof GameSettings) => {
    onUpdateSettings({ ...settings, [key]: !settings[key] });
  };

  const setMaxLevel = (level: 100 | 1000) => {
    onUpdateSettings({ ...settings, maxLevel: level });
  };

  return (
    <div className="absolute inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in duration-200 flex flex-col max-h-[90vh]">
        <div className="bg-slate-800 p-5 flex items-center justify-between shrink-0">
          <h2 className="text-white font-bold text-lg flex items-center gap-2">
            <Settings size={20} /> Mode Parent
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white bg-slate-700/50 p-1 rounded-full"><X size={20}/></button>
        </div>

        <div className="p-6 overflow-y-auto">
          {/* Stats Section */}
          <div className="mb-8">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <BarChart3 size={14} /> Statistiques
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                <div className="text-3xl font-black text-indigo-600 mb-1">{stats.missionsCompleted}</div>
                <div className="text-xs font-bold text-indigo-400 uppercase">Missions Réussies</div>
              </div>
              <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-100">
                <div className="text-3xl font-black text-yellow-600 mb-1">{stats.hintsUsed}</div>
                <div className="text-xs font-bold text-yellow-500 uppercase">Indices Utilisés</div>
              </div>
            </div>
          </div>

          <hr className="border-slate-100 mb-8" />

          {/* Settings Section */}
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Settings size={14} /> Configuration
            </h3>

            {/* Max Level */}
            <div className="mb-6">
              <label className="block text-sm font-bold text-slate-700 mb-2">Niveau Maximum</label>
              <div className="flex bg-slate-100 p-1 rounded-lg">
                <button 
                  onClick={() => setMaxLevel(100)}
                  className={cn("flex-1 py-2 text-sm font-bold rounded-md transition-all", settings.maxLevel === 100 ? "bg-white shadow text-indigo-600" : "text-slate-500 hover:text-slate-700")}
                >
                  100 (Débutant)
                </button>
                <button 
                  onClick={() => setMaxLevel(1000)}
                  className={cn("flex-1 py-2 text-sm font-bold rounded-md transition-all", settings.maxLevel === 1000 ? "bg-white shadow text-indigo-600" : "text-slate-500 hover:text-slate-700")}
                >
                  1000 (Avancé)
                </button>
              </div>
            </div>

            {/* Toggles */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-slate-700">Autoriser Échange Auto</div>
                  <div className="text-xs text-slate-400">Permet à l'enfant d'utiliser le mode automatique.</div>
                </div>
                <button onClick={() => toggle('autoExchangeAllowed')} className={cn("text-2xl transition-colors", settings.autoExchangeAllowed ? "text-green-500" : "text-slate-300")}>
                  {settings.autoExchangeAllowed ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-slate-700">Autoriser les Indices</div>
                  <div className="text-xs text-slate-400">Affiche le bouton ampoule.</div>
                </div>
                <button onClick={() => toggle('hintsAllowed')} className={cn("text-2xl transition-colors", settings.hintsAllowed ? "text-green-500" : "text-slate-300")}>
                  {settings.hintsAllowed ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-200 shrink-0">
           <button onClick={onReset} className="w-full text-red-500 text-xs font-bold hover:text-red-700 transition-colors">
             Réinitialiser toutes les données (localStorage)
           </button>
        </div>
      </div>
    </div>
  );
};


// 9. Main App
const App: React.FC = () => {
  // State: Settings & Stats (loaded from localStorage if available)
  const [settings, setSettings] = useState<GameSettings>(() => {
    const saved = localStorage.getItem('b10-settings');
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });

  const [stats, setStats] = useState<GameStats>(() => {
    const saved = localStorage.getItem('b10-stats');
    return saved ? JSON.parse(saved) : DEFAULT_STATS;
  });

  const [missionIndex, setMissionIndex] = useState(() => {
    const saved = localStorage.getItem('b10-mission-index');
    return saved ? parseInt(saved, 10) : 0;
  });

  const [showAssetPreview, setShowAssetPreview] = useState(false);

  // Derived: Filter missions based on settings
  const filteredMissions = useMemo(() => {
    return ALL_MISSIONS.filter(m => m.target <= settings.maxLevel);
  }, [settings.maxLevel]);

  // Ensure index is valid when filter changes
  useEffect(() => {
    if (missionIndex >= filteredMissions.length) {
      setMissionIndex(0);
    }
  }, [filteredMissions.length, missionIndex]);

  // Persist Data
  useEffect(() => localStorage.setItem('b10-settings', JSON.stringify(settings)), [settings]);
  useEffect(() => localStorage.setItem('b10-stats', JSON.stringify(stats)), [stats]);
  useEffect(() => localStorage.setItem('b10-mission-index', missionIndex.toString()), [missionIndex]);

  const [gamePhase, setGamePhase] = useState<GamePhase>('INTRO');
  const [checkShake, setCheckShake] = useState(false);
  const [activeDragType, setActiveDragType] = useState<PlaceValue | null>(null);
  
  // Parent Mode UI State
  const [showGatekeeper, setShowGatekeeper] = useState(false);
  const [showParentSettings, setShowParentSettings] = useState(false);

  const currentMission = filteredMissions[missionIndex] || ALL_MISSIONS[0];

  const handleStatsUpdate = (type: 'hint') => {
    setStats(prev => ({ ...prev, hintsUsed: prev.hintsUsed + 1 }));
  };

  const { 
    counts, total, decomposition, addBlock, clearBoard, exchangeBlock, undo, canUndo,
    isExchangePossible, autoExchange, toggleAutoExchange,
    hintState, incrementHintLevel, showFeedbackError
  } = useBoard(currentMission.target, settings, handleStatsUpdate);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 10 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 100, tolerance: 5 } })
  );

  const handleStartMission = () => {
    clearBoard();
    setGamePhase('PLAYING');
  };

  const handleCheck = () => {
    if (total === currentMission.target) {
      setGamePhase('SUCCESS');
      setStats(prev => ({ ...prev, missionsCompleted: prev.missionsCompleted + 1 }));
    } else {
      setCheckShake(true);
      showFeedbackError();
      setTimeout(() => setCheckShake(false), 500);
    }
  };

  const handleNextMission = () => {
    if (missionIndex < filteredMissions.length - 1) {
      setMissionIndex(prev => prev + 1);
      setGamePhase('INTRO');
    }
  };

  const handleReplayMission = () => {
    setGamePhase('INTRO');
  };

  const handleResetData = () => {
    if (confirm("Effacer toute la progression ?")) {
      localStorage.clear();
      setSettings(DEFAULT_SETTINGS);
      setStats(DEFAULT_STATS);
      setMissionIndex(0);
      setShowParentSettings(false);
      window.location.reload();
    }
  };

  // Drag Handlers
  const handleDragStart = (event: DragStartEvent) => {
    if (event.active.data.current) setActiveDragType(event.active.data.current.type as PlaceValue);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragType(null);
    if (!event.over) return;
    const sourceType = event.active.data.current?.type as PlaceValue;
    const targetType = event.over.data.current?.type as PlaceValue;
    if (sourceType === targetType) addBlock(sourceType);
  };

  // CSS Injection
  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      @keyframes shake {
        0%, 100% { transform: translateX(0); }
        10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
        20%, 40%, 60%, 80% { transform: translateX(4px); }
      }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="h-screen w-screen flex flex-col bg-slate-100 overflow-hidden select-none font-sans relative">
        {/* Modals */}
        {gamePhase === 'INTRO' && <MissionIntro mission={currentMission} onStart={handleStartMission} />}
        {gamePhase === 'SUCCESS' && <SuccessScreen mission={currentMission} onNext={handleNextMission} onReplay={handleReplayMission} isLast={missionIndex === filteredMissions.length - 1} />}
        {showAssetPreview && <AssetPreview onClose={() => setShowAssetPreview(false)} />}
        
        {showGatekeeper && (
          <GatekeeperModal 
            onSuccess={() => { setShowGatekeeper(false); setShowParentSettings(true); }} 
            onClose={() => setShowGatekeeper(false)} 
          />
        )}
        
        {showParentSettings && (
          <ParentSettingsModal 
            settings={settings} 
            stats={stats}
            onUpdateSettings={setSettings}
            onClose={() => setShowParentSettings(false)}
            onReset={handleResetData}
          />
        )}

        {hintState.level === 3 && hintState.message && <HintBubble message={hintState.message} />}

        {/* Header */}
        <header className="h-12 bg-white border-b border-slate-200 flex items-center px-4 justify-between shrink-0 z-30 shadow-sm">
          <div className="flex items-center gap-2">
            <h1 className="font-bold text-slate-700 flex items-center gap-2">
              <span className="w-6 h-6 bg-indigo-600 text-white rounded flex items-center justify-center text-xs shadow-sm">B10</span>
              <span className="hidden md:inline">Base 10 Blocks</span>
            </h1>
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            
            {/* Auto Exchange Toggle (Hidden if disabled by parent) */}
            {settings.autoExchangeAllowed && (
              <button onClick={toggleAutoExchange} className={cn("flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold transition-all border", autoExchange ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100")}>
                <Settings size={14} />
                <span className="hidden md:inline">Échange Auto</span>
                {autoExchange ? <ToggleRight size={20} className="text-indigo-600"/> : <ToggleLeft size={20} />}
              </button>
            )}

            <div className="text-xs text-slate-400 font-mono bg-slate-50 px-2 py-1 rounded hidden md:block">
              Mission {missionIndex + 1}/{filteredMissions.length}
            </div>

            {/* Asset Debug Button */}
            <button 
              onClick={() => setShowAssetPreview(true)}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              title="Preview Assets"
            >
              <Eye size={16} />
            </button>

            {/* Parent Lock Button */}
            <button 
              onClick={() => setShowGatekeeper(true)}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <Lock size={16} />
            </button>
          </div>
        </header>

        <main className="flex-1 flex overflow-hidden">
          <div className="w-20 md:w-32 shrink-0 z-20 h-full">
            <Palette />
          </div>
          <div className="flex-1 p-2 md:p-6 bg-slate-100 overflow-hidden flex flex-col relative z-10">
            <PlaceValueChart counts={counts} hintState={hintState} />
          </div>
          <div className="shrink-0 z-20 h-full">
            <div className={checkShake ? "animate-[shake_0.5s_ease-in-out]" : ""}>
              <ActionPanel 
                onClear={clearBoard} 
                onExchange={exchangeBlock}
                onUndo={undo}
                onCheck={handleCheck}
                onHint={incrementHintLevel}
                canExchange={isExchangePossible && !autoExchange}
                canCheck={total > 0}
                canUndo={canUndo}
                hintLevel={hintState.level}
                settings={settings}
              />
            </div>
          </div>
        </main>

        <footer className="shrink-0 z-30">
          <ResultDisplay total={total} decomposition={decomposition} target={currentMission.target} />
        </footer>
        <DragOverlay dropAnimation={{ duration: 250, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
          {activeDragType ? <BlockVisual type={activeDragType} isOverlay /> : null}
        </DragOverlay>
      </div>
    </DndContext>
  );
};

export default App;