import {pathToFileURL,fileURLToPath} from "node:url";
import path from "node:path";
const root=path.dirname(fileURLToPath(import.meta.url));
const aliases={"@/lib/socialWriterClient":"fixture-client.mjs","@/lib/prisma":"forbidden-legacy.mjs","@/lib/directMessageAttachments":"forbidden-legacy.mjs","@/lib/session":"session.ts","@/lib/previewDataSource":"preview-fixture.mjs","@/lib/productionAuth":"productionAuth.ts","@/lib/userDto":"userDto.ts","@/lib/restrictedDirectInbox":"restrictedDirectInbox.ts","@/lib/restrictedDirectInboxDto.mjs":"restrictedDirectInboxDto.mjs","@/lib/restrictedDirectImageStorage.mjs":"restrictedDirectImageStorage.mjs","next/server":"next-fixture-facade.mjs"};
export async function resolve(specifier,context,nextResolve){
 if(Object.hasOwn(aliases,specifier))return {url:pathToFileURL(path.join(root,aliases[specifier])).href,shortCircuit:true};
 return nextResolve(specifier,context);
}
