#!/usr/bin/env python3
# ================================================================
#  RSMP-IT Agent v5.0 — Full metrics monitoring
# ================================================================
import os,sys,time,json,socket,subprocess,platform
import urllib.request,urllib.error
from datetime import datetime

CONF=['/etc/rsmp-agent.conf','/etc/rs-agent.conf']
VER='5.0.0'; INTERVAL=60; LOG='/var/log/rsmp-agent.log'

def log(m,level='INFO'):
    ts=datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    line=f'[{ts}][{level}] {m}'
    print(line,flush=True)
    try:
        open(LOG,'a').write(line+'\n')
        if os.path.getsize(LOG)>5*1024*1024:
            lines=open(LOG).readlines()
            open(LOG,'w').writelines(lines[-500:])
    except: pass

def load():
    c={'RS_SERVER':'http://10.6.0.42:8081','RS_CLIENT_ID':'','RS_AGENT_TOKEN':'','RS_VNC_PASSWORD':''}
    for f in CONF:
        if os.path.exists(f):
            for l in open(f):
                if '=' in l and not l.startswith('#'):
                    k,_,v=l.strip().partition('='); c[k.strip()]=v.strip()
    return c

def save(s,cid,token):
    c=load(); c['RS_SERVER']=s; c['RS_CLIENT_ID']=cid; c['RS_AGENT_TOKEN']=token
    try: open(CONF[0],'w').write(''.join(f'{k}={v}\n' for k,v in c.items()))
    except: pass

def run(cmd,t=10):
    try: return subprocess.run(cmd,shell=True,capture_output=True,text=True,timeout=t).stdout.strip()
    except: return ''

def get_ip():
    try:
        s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM); s.connect(('8.8.8.8',80))
        ip=s.getsockname()[0]; s.close(); return ip
    except: return run("hostname -I|awk '{print $1}'",'127.0.0.1')

def cpu():
    try:
        def rd():
            v=list(map(int,open('/proc/stat').readline().split()[1:]))
            return v[3]+v[4],sum(v)
        i1,t1=rd(); time.sleep(0.3); i2,t2=rd(); td=t2-t1
        return round((1-(i2-i1)/td)*100,1) if td else 0.0
    except: return 0.0

def ram():
    try:
        m={}
        for l in open('/proc/meminfo'):
            k,v=l.split(':'); m[k.strip()]=int(v.strip().split()[0])
        tot=m.get('MemTotal',0); avl=m.get('MemAvailable',m.get('MemFree',0))
        return round((tot-avl)/tot*100,1) if tot else 0.0
    except: return 0.0

def disk():
    try:
        st=os.statvfs('/'); t=st.f_blocks*st.f_frsize; f=st.f_bfree*st.f_frsize
        return round((t-f)/t*100,1) if t else 0.0
    except: return 0.0

def uptime():
    try:
        s=float(open('/proc/uptime').read().split()[0])
        d,h,m=int(s//86400),int(s%86400//3600),int(s%3600//60)
        p=[f'{d}d'] if d else []
        p+=[f'{h}h'] if h else []
        p.append(f'{m}m'); return ' '.join(p)
    except: return run('uptime -p') or 'unknown'

def load_avg():
    try: return ' '.join(open('/proc/loadavg').read().split()[:3])
    except: return ''

def boot_time():
    try:
        for l in open('/proc/stat'):
            if l.startswith('btime'):
                return datetime.fromtimestamp(int(l.split()[1])).strftime('%Y-%m-%d %H:%M')
    except: pass
    return ''

def updates():
    try:
        n=int(run('apt list --upgradable 2>/dev/null|grep -c upgradable',15))
        return max(0,n-1)
    except: return 0

def running_apps():
    try:
        out=run("ps aux --no-headers --sort=-%mem|awk '$3>0.5||$4>1{print $11}'|grep -v '\\['|xargs -I{} basename {}|sort -u|head -15",10)
        skip={'sh','bash','python3','systemd','grep','ps','awk','xargs','sed','node','npm'}
        apps=[a for a in out.split('\n') if a and a.lower() not in skip]
        return ', '.join(apps[:12])
    except: return ''

def network():
    try:
        ip=get_ip()
        iface=run("ip route get 8.8.8.8 2>/dev/null|awk '{print $5;exit}'",5)
        gw=run("ip route|grep default|awk '{print $3}'|head -1",5)
        mac=run(f"cat /sys/class/net/{iface}/address 2>/dev/null",3) if iface else ''
        return json.dumps({'ip':ip,'iface':iface,'gateway':gw,'mac':mac})
    except: return ''

def logged_users():
    try: return run("who|awk '{print $1}'|sort -u|tr '\\n' ','",5).rstrip(',')
    except: return ''

def services():
    svcs=['rsmp-agent','x11vnc','rustdesk','ssh','rsmp-update.timer']
    r={}
    for s in svcs: r[s]=run(f'systemctl is-active {s} 2>/dev/null',5) or 'inactive'
    return json.dumps(r)

def os_info():
    try: return run("grep PRETTY_NAME /etc/os-release|cut -d'\"' -f2") or platform.platform()
    except: return platform.platform()

def post(url,data,token,t=12):
    try:
        b=json.dumps(data).encode()
        headers={'Content-Type':'application/json','User-Agent':f'RSMP-Agent/{VER}'}
        if token: headers['X-Agent-Token']=token
        req=urllib.request.Request(url,b,headers)
        with urllib.request.urlopen(req,timeout=t) as r: return json.loads(r.read().decode())
    except urllib.error.URLError as e: raise ConnectionError(f'HTTP: {e.reason}')
    except Exception as e: raise ConnectionError(str(e))

def register(s,token,vnc_password=''):
    log(f'Daftar ke: {s}')
    r=post(f'{s}/api/agent/register',{'hostname':socket.gethostname(),'ip':get_ip(),'os':os_info(),'agentVersion':VER,'osType':'linux','vnc_password':vnc_password},token)
    cid=r.get('clientId','')
    if cid: save(s,cid,token); log(f'ID: {cid}')
    return cid

def heartbeat(s,cid,token):
    return post(f'{s}/api/agent/heartbeat',{
        'type':'heartbeat','clientId':cid,'agentVersion':VER,
        'hostname':socket.gethostname(),'ip':get_ip(),'os':os_info(),'osType':'linux',
        'cpu':cpu(),'ram':ram(),'disk':disk(),'uptime':uptime(),
        'loadAvg':load_avg(),'bootTime':boot_time(),
        'packagesPending':updates(),'runningApps':running_apps(),
        'loggedUsers':logged_users(),'networkInfo':network(),
        'servicesStatus':services(),'timestamp':datetime.now().isoformat()
    },token)

def exec_cmd(cmd):
    log(f'Cmd: {str(cmd)[:60]}')
    if cmd=='update': subprocess.Popen(['sudo','/usr/local/bin/rsmp-do-update.sh'])
    elif cmd=='restart-agent': run('sudo systemctl restart rsmp-agent')
    elif cmd=='restart-vnc': run('sudo systemctl restart x11vnc')
    elif cmd=='restart-rustdesk': run('sudo systemctl restart rustdesk')
    elif cmd=='stop-agent':
        # Client dihapus di platform -> hentikan diri biar tidak re-register.
        log('stop-agent: client dihapus di platform, agent berhenti.')
        run('sudo systemctl disable --now rsmp-agent')
        sys.exit(0)
    elif isinstance(cmd,str) and cmd.startswith('shell:'):
        log(run(cmd[6:],60)[:200])

def main():
    log(f'RSMP-IT Agent v{VER} start')
    c=load(); S=c['RS_SERVER']; ID=c['RS_CLIENT_ID']; TOKEN=c['RS_AGENT_TOKEN']; VNCP=c['RS_VNC_PASSWORD']
    log(f'Server={S} ID={ID or "none"}')
    if not ID:
        for i in range(10):
            try:
                ID=register(S,TOKEN,VNCP)
                if ID: break
            except Exception as e: log(f'Register {i+1}/10: {e}','WARN')
            time.sleep(30)
    errs=0
    while True:
        try:
            resp=heartbeat(S,ID,TOKEN); errs=0
            cmd=resp.get('command')
            if cmd: exec_cmd(cmd)
        except ConnectionError as e:
            errs+=1
            if errs%5==1: log(f'HB err #{errs}: {e}','WARN')
            if errs>=30:
                log('Re-register...','WARN')
                try:
                    nid=register(S,TOKEN,VNCP)
                    if nid: ID=nid; errs=0
                except: pass
        except Exception as e: errs+=1; log(f'Err: {e}','ERROR')
        time.sleep(INTERVAL)

if __name__=='__main__':
    try: main()
    except KeyboardInterrupt: log('Stopped')
    except Exception as e: log(f'Fatal: {e}','ERROR'); sys.exit(1)
