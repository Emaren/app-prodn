import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminSession";
import { loadPublishedHeroPlaylist } from "@/lib/hero/service";
import {
  isHeroStageTakeoverLive,
  readHeroStageTakeoverState,
} from "@/lib/heroStageTakeover";
import {
  localPressFile, safePressBasename, pressPackStream,
  PRESS_MAX_FILES, type PressFile, type PressPackSeed,
} from "@/lib/chroniclePressPack";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const HEADERS={
  "Cache-Control":"private, no-store, max-age=0",
  "Vary":"Cookie",
  "X-Content-Type-Options":"nosniff",
};
type ImageRef={role:string;url:string};
type Placement=Record<string,unknown> & {images:ImageRef[]};

export async function GET(request:NextRequest){
  const gate=await requireAdmin(request);
  if("error" in gate)return gate.error;
  try{
    // Query the same published source that renders / and /lobby;
    // drafts and archived screens are not mistaken for the active carousel.
    const [playlist,takeover]=await Promise.all([
      loadPublishedHeroPlaylist(gate.prisma),
      readHeroStageTakeoverState(),
    ]);
    const capturedAt=new Date();
    const takeoverLive=isHeroStageTakeoverLive(takeover,capturedAt);
    const warnings:string[]=[];
    const placements:Placement[]=[];
    if(takeoverLive){
      takeover.slides.forEach((slide,index)=>{
        placements.push({
          screenId:slide.id,position:index,enabled:true,
          screenType:"image_takeover",title:slide.title,
          imageAlt:slide.imageAlt,createdAt:slide.createdAt,
          link:slide.linkUrl,images:[{role:"main-hero",url:slide.imageUrl}],
        });
      });
    }else{
      for(const item of playlist.items){
        const {screen}=item;
        const images:ImageRef[]=[];
        const add=(role:string,url:string|null|undefined)=>{
          if(url)images.push({role,url});
        };
        add("main-hero",screen.config.backgroundImageUrl);
        add("mobile-hero",screen.config.mobileBackgroundImageUrl);
        if(screen.mediaAsset?.url){
          const media=screen.mediaAsset;
          if(media.mimeType.startsWith("image/") || /\.(png|jpe?g|webp|gif)(?:\?|$)/i.test(media.url)){
            add("main-hero",media.url);
          }else warnings.push("One non-image Hero media asset was excluded from the image-only ZIP.");
        }
        if(screen.type==="featured_event"&&screen.eventTile){
          add("main-hero",screen.eventTile.backgroundImageUrl);
          add("mobile-hero",screen.eventTile.mobileBackgroundImageUrl);
          add("title-belt",screen.eventTile.beltImageUrl);
        }
        // Cover poster art is an image, but never include executable video bytes.
        add("motion-poster",screen.config.posterUrl);
        placements.push({
          screenId:screen.id,playlistItemId:item.id,position:item.position,
          enabled:item.enabled,startsAt:item.startsAt,endsAt:item.endsAt,
          durationMs:item.durationMs,screenType:screen.type,screenName:screen.name,
          languageCode:screen.config.languageCode??"en",
          languageGroupKey:screen.config.languageGroupKey??null,
          masthead:screen.config.masthead??null,
          editionLabel:screen.config.editionLabel??null,
          headline:screen.config.title??screen.eventTile?.title??screen.forumThread?.title??null,
          linkedForumThread:screen.forumThread?{
            slug:screen.forumThread.slug,title:screen.forumThread.title,
            createdAt:screen.forumThread.createdAt,
          }:null,
          featuredEvent:screen.eventTile?{
            title:screen.eventTile.title,dateLabel:screen.eventTile.dateLabel,
            championBelt:screen.eventTile.linkedTrophyName,
            contenderOne:screen.eventTile.playerOneName,
            contenderTwo:screen.eventTile.playerTwoName,
            publishedAt:screen.eventTile.publishedAt,
          }:null,
          href:item.href,images,
        });
      }
    }
    const refs=new Map<string,{url:string;roles:Set<string>;slots:number[]}>();
    for(let slot=0;slot<placements.length;slot++){
      for(const image of placements[slot].images){
        const key=image.url.split("?")[0];
        const existing=refs.get(key);
        if(existing){existing.roles.add(image.role);existing.slots.push(slot);}
        else refs.set(key,{url:image.url,roles:new Set([image.role]),slots:[slot]});
      }
    }
    if(refs.size<1)return NextResponse.json({
      detail:"No currently published hero artwork is available for export.",
      publishedVersion:playlist.publishedVersion,
    },{status:409,headers:HEADERS});
    if(refs.size>PRESS_MAX_FILES)return NextResponse.json({
      detail:"Chronicle press pack exceeds the reviewed single-ZIP item limit.",
      count:refs.size,maximum:PRESS_MAX_FILES,
    },{status:413,headers:HEADERS});

    const files:PressFile[]=[];
    const sourceIndex:Record<string,string>={};
    let index=0;
    for(const [key,reference] of refs){
      index++;
      const filename=`images/${String(index).padStart(3,"0")}-${safePressBasename(reference.url)}`;
      // Never perform arbitrary GETs or allow server-side request forgery.
      // Any required missing/local-unsupported source fails the entire export.
      const file=await localPressFile(reference.url,filename);
      files.push(file);
      sourceIndex[key]=filename;
    }
    for(const placement of placements){
      placement.images=placement.images.map(img=>({
        ...img,archiveName:sourceIndex[img.url.split("?")[0]],
      }));
    }
    if(takeoverLive)warnings.push("Legacy image takeover is the visible homepage surface; Hero Studio publication is not displayed.");
    const seed:PressPackSeed={
      schema:"aoe2war.chronicle.press-pack.v1",
      exportedAt:capturedAt.toISOString(),
      selectedSurface:takeoverLive?"hero-stage-takeover":"hero-studio-publication",
      publishedVersion:takeoverLive?null:playlist.publishedVersion,
      publishedAt:takeoverLive?null:playlist.publishedAt,
      carousel:takeoverLive?{
        active:takeover.active,intervalMs:takeover.intervalMs,
        transitionMs:takeover.transitionMs,transitionStyle:takeover.transitionStyle,
      }:{
        source:playlist.source,autoplay:playlist.playlist.autoplay,
        defaultDurationMs:playlist.playlist.defaultDurationMs,
        transitionStyle:playlist.playlist.transitionStyle,
      },
      placements,sourceWarnings:warnings,
    };
    const date=capturedAt.toISOString().replace(/[-:]/g,"").replace(/\..+$/,"Z");
    const filename=`AoE2WAR-Chronicle-PressPack-${date}.zip`;
    return new NextResponse(pressPackStream(files,seed),{
      headers:{...HEADERS,
        "Content-Type":"application/zip",
        "Content-Disposition":`attachment; filename="${filename}"`,
        "X-AoE2WAR-Chronicle-Images":String(files.length),
        "X-AoE2WAR-Chronicle-Source":seed.selectedSurface,
      },
    });
  }catch(error){
    // Generic error intentionally avoids returning private disk paths and raw query state.
    console.error("Chronicle export refused:",error instanceof Error?error.message:"unknown");
    return NextResponse.json({
      detail:"Chronicle export could not verify every original image. Nothing was exported.",
      code:"CHRONICLE_SOURCE_INTEGRITY_HOLD",
    },{status:409,headers:HEADERS});
  }
}
