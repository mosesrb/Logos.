import fs from 'fs';
import path from 'path';

const controllersDir = path.join(process.cwd(), 'controllers');
const files = fs.readdirSync(controllersDir).filter(f => f.endsWith('Controller.js'));

files.forEach(file => {
    let content = fs.readFileSync(path.join(controllersDir, file), 'utf8');
    
    // 1. Add DB imports if not present
    if (!content.includes('import { getSession, getPersonas, getPersona, getRelationships, getRelationship } from "../services/dbService.js"')) {
        content = content.replace('import { getSystemStats', 'import { getSession, getPersonas, getPersona, getRelationships, getRelationship, syncSession, syncPersona, syncMessage, syncRelationship } from "../services/dbService.js";\nimport { getSystemStats');
    }

    // 2. Replace sessions[id] with (await getSession(id))
    content = content.replace(/sessions\[(.+?)\]\s*=\s*(.+?);/g, '/* replaced assignment to sessions */ await syncSession($2);');
    content = content.replace(/delete sessions\[(.+?)\];/g, '/* replaced delete sessions */ await runQuery("DELETE FROM Sessions WHERE id = ?", [$1]);');
    content = content.replace(/sessions\[(.+?)\]/g, '(await getSession($1))');
    
    // 3. Replace ensureSession
    content = content.replace(/ensureSession\((.+?)\)/g, '(await ensureSessionAsync($1))');
    
    // 4. Replace personas
    content = content.replace(/personas\.find/g, '(await getPersonas()).find');
    content = content.replace(/personas\.map/g, '(await getPersonas()).map');
    content = content.replace(/personas\.forEach/g, '(await getPersonas()).forEach');
    content = content.replace(/personas\.length/g, '(await getPersonas()).length');
    
    // 5. Replace resolvePersona
    content = content.replace(/resolvePersona\((.+?)\)/g, '(await getPersona($1))');
    
    // 6. Replace relationships[key]
    content = content.replace(/relationships\[(.+?)\]\s*=\s*(.+?);/g, '/* replaced relationship assign */ await syncRelationship($1.split("_")[1], $2);');
    content = content.replace(/relationships\[(.+?)\]/g, '(await getRelationship($1.split("_")[1]))');

    fs.writeFileSync(path.join(controllersDir, file), content, 'utf8');
    console.log(`✅ Refactored ${file}`);
});
