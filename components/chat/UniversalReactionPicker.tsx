"use client";

import { Plus, Search, SmilePlus } from "lucide-react";
import { useMemo, useState } from "react";

import { useReactionMru } from "@/components/chat/reactionPreference";
import { normalizeReactionEmoji } from "@/lib/reactionEmoji";

type ReactionCategory =
  | "faces"
  | "hands"
  | "hearts"
  | "battle"
  | "animals"
  | "food"
  | "activity"
  | "travel"
  | "objects"
  | "symbols"
  | "flags";

type ReactionEntry = {
  emoji: string;
  label: string;
  category: ReactionCategory;
};

const CATEGORY_TABS: ReadonlyArray<{
  key: ReactionCategory;
  icon: string;
  label: string;
}> = [
  { key: "faces", icon: "😀", label: "Faces" },
  { key: "hands", icon: "👍", label: "Hands" },
  { key: "hearts", icon: "❤️", label: "Hearts" },
  { key: "battle", icon: "⚔️", label: "Battle" },
  { key: "animals", icon: "🐺", label: "Animals" },
  { key: "food", icon: "🍻", label: "Food" },
  { key: "activity", icon: "🏆", label: "Activity" },
  { key: "travel", icon: "🚀", label: "Travel" },
  { key: "objects", icon: "💎", label: "Objects" },
  { key: "symbols", icon: "✨", label: "Symbols" },
  { key: "flags", icon: "🏴‍☠️", label: "Flags" },
];

const REACTION_CATALOG: ReadonlyArray<ReactionEntry> = [
  ["😀","grinning happy smile","faces"],["😃","happy smile","faces"],["😄","big smile joy","faces"],["😁","beaming grin","faces"],["😆","laugh squint","faces"],["😅","sweat laugh","faces"],["😂","tears joy laugh","faces"],["🤣","rolling laugh","faces"],["🥲","smile tear","faces"],["😊","blush happy","faces"],["😇","angel halo","faces"],["🙂","smile","faces"],["🙃","upside down","faces"],["😉","wink","faces"],["😌","relieved","faces"],["😍","heart eyes love","faces"],["🥰","hearts love","faces"],["😘","kiss","faces"],["😎","cool sunglasses","faces"],["🤓","nerd","faces"],["🧐","monocle","faces"],["🤩","star struck","faces"],["🥳","party","faces"],["😏","smirk","faces"],["😒","unamused","faces"],["🙄","eye roll","faces"],["😬","grimace","faces"],["🤥","lie","faces"],["😴","sleep","faces"],["🤤","drool","faces"],["😵","dizzy","faces"],["🤯","mind blown","faces"],["🥶","cold","faces"],["🥵","hot","faces"],["🤬","angry swear","faces"],["😈","devil","faces"],["💀","skull dead","faces"],["☠️","skull crossbones","faces"],["👻","ghost","faces"],["🤖","robot","faces"],["🫡","salute","faces"],["🫠","melting","faces"],["🥹","holding tears","faces"],["🫨","shaking face","faces"],
  ["👍","thumb up yes","hands"],["👎","thumb down no","hands"],["👌","ok perfect","hands"],["🤌","pinched fingers","hands"],["✌️","victory peace","hands"],["🤞","fingers crossed luck","hands"],["🫰","finger heart","hands"],["🤟","love you hand","hands"],["🤘","rock horns","hands"],["🤙","call me","hands"],["👈","point left","hands"],["👉","point right","hands"],["👆","point up","hands"],["👇","point down","hands"],["☝️","index up","hands"],["✋","raised hand","hands"],["🤚","back hand","hands"],["🖐️","five hand","hands"],["🖖","vulcan","hands"],["👋","wave","hands"],["👏","clap applause","hands"],["🙌","raise hands celebrate","hands"],["🫶","heart hands","hands"],["🤝","handshake deal","hands"],["🙏","pray thanks","hands"],["💪","muscle strong","hands"],["🦾","robot arm strong","hands"],["🖕","middle finger","hands"],
  ["❤️","red heart love","hearts"],["🧡","orange heart","hearts"],["💛","yellow heart","hearts"],["💚","green heart","hearts"],["💙","blue heart","hearts"],["💜","purple heart","hearts"],["🖤","black heart","hearts"],["🤍","white heart","hearts"],["🤎","brown heart","hearts"],["🩷","pink heart","hearts"],["🩵","light blue heart","hearts"],["🩶","grey heart","hearts"],["💔","broken heart","hearts"],["❤️‍🔥","heart fire passion","hearts"],["❤️‍🩹","healing heart","hearts"],["💕","two hearts","hearts"],["💞","revolving hearts","hearts"],["💓","beating heart","hearts"],["💗","growing heart","hearts"],["💖","sparkling heart","hearts"],["💘","arrow heart","hearts"],["💝","gift heart","hearts"],
  ["⚔️","crossed swords battle","battle"],["🗡️","dagger sword","battle"],["🛡️","shield defense","battle"],["🏹","bow arrow","battle"],["🪓","axe","battle"],["🔨","hammer","battle"],["⚒️","hammer pick","battle"],["⛏️","pickaxe","battle"],["👑","crown king","battle"],["🏰","castle kingdom","battle"],["🏯","fortress castle","battle"],["🔥","fire hot","battle"],["💥","boom impact","battle"],["🩸","blood","battle"],["💣","bomb","battle"],["🧨","dynamite","battle"],["🎯","target bullseye","battle"],["🏆","trophy champion","battle"],["🥇","gold medal first","battle"],["🦅","eagle","battle"],["🐉","dragon","battle"],["🐺","wolf","battle"],["🦁","lion","battle"],["🦾","machine arm","battle"],["🤺","fencer sword","battle"],
  ["🐶","dog","animals"],["🐱","cat","animals"],["🐭","mouse","animals"],["🐹","hamster","animals"],["🐰","rabbit","animals"],["🦊","fox","animals"],["🐻","bear","animals"],["🐼","panda","animals"],["🐻‍❄️","polar bear","animals"],["🐨","koala","animals"],["🐯","tiger","animals"],["🦁","lion","animals"],["🐮","cow","animals"],["🐷","pig","animals"],["🐸","frog","animals"],["🐵","monkey","animals"],["🙈","monkey see no evil","animals"],["🙉","monkey hear no evil","animals"],["🙊","monkey speak no evil","animals"],["🐔","chicken","animals"],["🐧","penguin","animals"],["🐦","bird","animals"],["🦅","eagle","animals"],["🦆","duck","animals"],["🦉","owl","animals"],["🐺","wolf","animals"],["🐗","boar","animals"],["🐴","horse","animals"],["🦄","unicorn","animals"],["🐝","bee","animals"],["🦋","butterfly","animals"],["🐢","turtle","animals"],["🐍","snake","animals"],["🦖","dinosaur","animals"],["🐉","dragon","animals"],
  ["🍎","apple","food"],["🍌","banana","food"],["🍇","grapes","food"],["🍉","watermelon","food"],["🍓","strawberry","food"],["🍒","cherries","food"],["🥩","steak meat","food"],["🍗","chicken","food"],["🍔","burger","food"],["🍟","fries","food"],["🍕","pizza","food"],["🌭","hot dog","food"],["🌮","taco","food"],["🌯","burrito","food"],["🍿","popcorn","food"],["🍩","donut","food"],["🍪","cookie","food"],["🎂","cake birthday","food"],["☕","coffee","food"],["🍺","beer","food"],["🍻","cheers beer","food"],["🥂","cheers glasses","food"],["🍷","wine","food"],["🥃","whisky glass","food"],
  ["⚽","soccer","activity"],["🏀","basketball","activity"],["🏈","football","activity"],["⚾","baseball","activity"],["🎾","tennis","activity"],["🏐","volleyball","activity"],["🏒","hockey","activity"],["🎱","pool billiards","activity"],["🏓","ping pong","activity"],["🥊","boxing glove","activity"],["🥋","martial arts","activity"],["🎮","game controller gaming","activity"],["🕹️","joystick gaming","activity"],["🎲","dice","activity"],["♟️","chess","activity"],["🏆","trophy","activity"],["🥇","gold medal","activity"],["🎉","party popper","activity"],["🎊","confetti","activity"],["🎸","guitar","activity"],["🎧","headphones music","activity"],
  ["🚗","car","travel"],["🏎️","race car","travel"],["🚓","police car","travel"],["🚑","ambulance","travel"],["🚒","fire truck","travel"],["🚜","tractor","travel"],["🏍️","motorcycle","travel"],["🚲","bike","travel"],["✈️","airplane","travel"],["🚀","rocket","travel"],["🛸","ufo","travel"],["⛵","sailboat","travel"],["🚢","ship","travel"],["⚓","anchor","travel"],["🏠","house","travel"],["🏰","castle","travel"],["🌋","volcano","travel"],["🏔️","mountain","travel"],["🌎","earth world","travel"],["🌙","moon","travel"],["☀️","sun","travel"],["⭐","star","travel"],["🌌","milky way space","travel"],
  ["⌚","watch time","objects"],["📱","phone","objects"],["💻","laptop computer","objects"],["⌨️","keyboard","objects"],["🖥️","desktop computer","objects"],["📷","camera","objects"],["🎥","movie camera","objects"],["📺","tv","objects"],["💡","light bulb idea","objects"],["🔦","flashlight","objects"],["📚","books","objects"],["📜","scroll","objects"],["📝","note write","objects"],["💰","money bag","objects"],["💸","money flying","objects"],["💎","gem diamond","objects"],["🪙","coin","objects"],["🔑","key","objects"],["🗝️","old key","objects"],["🔒","lock","objects"],["🔓","unlock","objects"],["🔔","bell","objects"],["📌","pin","objects"],["🧲","magnet","objects"],["🧱","brick","objects"],["🪵","wood","objects"],
  ["✅","check yes","symbols"],["❌","cross no","symbols"],["❗","exclamation","symbols"],["❓","question","symbols"],["‼️","double exclamation","symbols"],["⁉️","question exclamation","symbols"],["💯","hundred perfect","symbols"],["✨","sparkles","symbols"],["⚡","lightning","symbols"],["💫","dizzy star","symbols"],["🌟","glowing star","symbols"],["⭐","star","symbols"],["🔴","red circle","symbols"],["🟠","orange circle","symbols"],["🟡","yellow circle","symbols"],["🟢","green circle","symbols"],["🔵","blue circle","symbols"],["🟣","purple circle","symbols"],["⚫","black circle","symbols"],["⚪","white circle","symbols"],["♻️","recycle","symbols"],["☢️","radioactive","symbols"],["☮️","peace","symbols"],["☯️","yin yang","symbols"],["♾️","infinity","symbols"],
  ["🇨🇦","canada flag","flags"],["🇺🇸","usa united states flag","flags"],["🇲🇽","mexico flag","flags"],["🇫🇮","finland flag","flags"],["🇵🇰","pakistan flag","flags"],["🇬🇧","uk britain flag","flags"],["🇫🇷","france flag","flags"],["🇩🇪","germany flag","flags"],["🇪🇸","spain flag","flags"],["🇮🇹","italy flag","flags"],["🇵🇱","poland flag","flags"],["🇺🇦","ukraine flag","flags"],["🇨🇳","china flag","flags"],["🇯🇵","japan flag","flags"],["🇰🇷","korea flag","flags"],["🇮🇳","india flag","flags"],["🇧🇷","brazil flag","flags"],["🇦🇷","argentina flag","flags"],["🇦🇺","australia flag","flags"],["🇳🇿","new zealand flag","flags"],["🏴‍☠️","pirate flag","flags"],
].map(([emoji, label, category]) => ({ emoji, label, category })) as ReactionEntry[];

function ReactionButton({
  emoji,
  active,
  disabled,
  compact,
  onPick,
}: {
  emoji: string;
  active: boolean;
  disabled: boolean;
  compact: boolean;
  onPick: (emoji: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(emoji)}
      disabled={disabled}
      aria-label={`React ${emoji}`}
      aria-pressed={active}
      className={`grid ${compact ? "h-8 w-8 text-[1.02rem]" : "h-9 w-9 text-[1.15rem]"} place-items-center rounded-lg border transition hover:-translate-y-0.5 hover:scale-105 disabled:opacity-45 ${
        active
          ? "border-amber-200/35 bg-amber-300/15 shadow-[inset_0_0_0_1px_rgba(253,230,138,0.08)]"
          : "border-transparent bg-white/[0.035] hover:border-white/12 hover:bg-white/[0.08]"
      }`}
    >
      {emoji}
    </button>
  );
}

export default function UniversalReactionPicker({
  activeReactions = [],
  disabled = false,
  variant = "full",
  onPick,
}: {
  activeReactions?: readonly string[];
  disabled?: boolean;
  variant?: "full" | "compact";
  onPick: (emoji: string) => void;
}) {
  const compact = variant === "compact";
  const { recent, remember } = useReactionMru();
  const [category, setCategory] = useState<ReactionCategory>("faces");
  const [query, setQuery] = useState("");
  const [customNotice, setCustomNotice] = useState(false);
  const active = useMemo(() => new Set(activeReactions), [activeReactions]);

  const exactEmoji = normalizeReactionEmoji(query);
  const normalizedQuery = query.trim().toLowerCase();
  const visible = useMemo(() => {
    if (exactEmoji) {
      return [{ emoji: exactEmoji, label: "Use emoji", category } satisfies ReactionEntry];
    }
    if (normalizedQuery) {
      return REACTION_CATALOG.filter((entry) =>
        `${entry.emoji} ${entry.label}`.toLowerCase().includes(normalizedQuery),
      ).slice(0, 72);
    }
    return REACTION_CATALOG.filter((entry) => entry.category === category);
  }, [category, exactEmoji, normalizedQuery]);

  function pick(emoji: string) {
    const normalized = normalizeReactionEmoji(emoji);
    if (!normalized || disabled) return;
    remember(normalized);
    onPick(normalized);
  }

  return (
    <div
      className={compact
        ? "w-[min(15rem,calc(100vw-1.25rem))]"
        : "w-[min(19rem,calc(100vw-2.5rem))]"}
      data-reaction-picker-variant={variant}
      aria-label="Reaction picker"
    >
      <div className="flex items-center gap-2 px-1 pb-2">
        <SmilePlus className="h-3.5 w-3.5 shrink-0 text-amber-100/60" aria-hidden="true" />
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search or paste emoji"
            aria-label="Search or paste any emoji"
            className={`${compact ? "h-7 text-[10px]" : "h-8 text-[11px]"} w-full rounded-lg border border-white/9 bg-black/25 pl-8 pr-2 text-white outline-none placeholder:text-slate-600 focus:border-amber-200/25`}
          />
        </div>
      </div>

      {recent.length > 0 ? (
        <div className="border-y border-white/[0.055] px-1 py-2">
          <div className="mb-1.5 px-1 text-[8px] font-black uppercase tracking-[0.19em] text-slate-600">Recent</div>
          <div className="flex flex-wrap gap-1">
            {recent.slice(0, compact ? 6 : 8).map((emoji) => (
              <ReactionButton
                key={`recent-${emoji}`}
                emoji={emoji}
                active={active.has(emoji)}
                disabled={disabled}
                compact={compact}
                onPick={pick}
              />
            ))}
          </div>
        </div>
      ) : null}

      {!normalizedQuery ? (
        <div className="flex items-center gap-0.5 overflow-x-auto px-1 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {CATEGORY_TABS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => setCategory(entry.key)}
              aria-label={entry.label}
              aria-pressed={category === entry.key}
              title={entry.label}
              className={`grid h-7 w-7 shrink-0 place-items-center rounded-md text-sm transition ${
                category === entry.key
                  ? "bg-amber-300/12 shadow-[inset_0_0_0_1px_rgba(253,230,138,0.12)]"
                  : "text-slate-400 hover:bg-white/[0.06]"
              }`}
            >
              {entry.icon}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCustomNotice((value) => !value)}
            aria-label="Add custom reaction"
            title="Add custom reaction"
            className="ml-auto grid h-7 w-7 shrink-0 place-items-center rounded-md border border-dashed border-white/10 text-slate-500 transition hover:border-amber-200/20 hover:bg-amber-300/[0.06] hover:text-amber-100"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      {customNotice ? (
        <div className="mx-1 mb-1 rounded-lg border border-amber-200/10 bg-amber-300/[0.045] px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-[0.13em] text-amber-100/65">
          Custom reactions · soon
        </div>
      ) : null}

      <div className={`${compact ? "max-h-36" : "max-h-48"} overflow-y-auto px-1 pb-1 [scrollbar-color:rgba(148,163,184,0.24)_transparent]`}>
        <div className="grid grid-cols-7 gap-1">
          {visible.map((entry) => (
            <ReactionButton
              key={`${entry.category}-${entry.emoji}`}
              emoji={entry.emoji}
              active={active.has(entry.emoji)}
              disabled={disabled}
              compact={compact}
              onPick={pick}
            />
          ))}
        </div>
        {visible.length === 0 ? (
          <div className="px-2 py-5 text-center text-[10px] text-slate-600">
            Paste any emoji above
          </div>
        ) : null}
      </div>
    </div>
  );
}
