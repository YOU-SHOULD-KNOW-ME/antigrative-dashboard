"""Draw documentation assets with explicitly illustrative, non-account data."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs' / 'assets'
OUT.mkdir(parents=True, exist_ok=True)
FONT = Path('C:/Windows/Fonts/msyh.ttc')
BOLD = Path('C:/Windows/Fonts/msyhbd.ttc')

def font(size, bold=False):
    return ImageFont.truetype(str(BOLD if bold else FONT), size)

def text(draw, xy, value, size=22, color='#b9c0cd', bold=False):
    draw.text(xy, value, font=font(size, bold), fill=color)

def canvas(width=1400, height=680):
    image = Image.new('RGB', (width, height), '#11141c')
    draw = ImageDraw.Draw(image)
    for y in range(height):
        mix = y / height
        draw.line((0, y, width, y), fill=(17 + int(6*mix), 20 + int(6*mix), 28 + int(9*mix)))
    return image, draw

def composer(draw, box, speed=True):
    x,y,w=box
    draw.rounded_rectangle((x,y,x+w,y+135),radius=22,fill='#24272e',outline='#3a3f4b',width=1)
    text(draw,(x+23,y+19),'Ask anything, @ to mention, / for actions',19,'#8992a2')
    text(draw,(x+23,y+88),'＋',20,'#8892a3')
    text(draw,(x+57,y+91),'Gemini Flash High',17,'#c5ccda')
    draw.line([(x+229,y+100),(x+233,y+104),(x+237,y+100)],fill='#9ba6b7',width=1)
    start=x+276
    if speed:
        small_icon(draw,start,y+99,'gauge');text(draw,(start+22,y+92),'104.6 tok/s',15,'#d4def5');start+=160
    small_icon(draw,start,y+99,'clock');text(draw,(start+22,y+92),'5h 83.4%  02:46:18',15,'#bbc7de');start+=224
    small_icon(draw,start,y+99,'calendar');text(draw,(start+22,y+92),'周 61.7%  4天 13:24',15,'#bbc7de')
    draw.ellipse((x+w-63,y+78,x+w-25,y+116),fill='#394356')
    text(draw,(x+w-54,y+82),'↑',22,'#a5b8df')

def statcard(draw, box, title, rows, balance=None):
    x,y,w,h=box
    draw.rounded_rectangle((x,y,x+w,y+h),radius=18,fill='#30343d',outline='#454b59')
    text(draw,(x+21,y+18),title,19,'#edf0f6',True)
    draw.line((x+20,y+54,x+w-20,y+54),fill='#505560')
    offset=72
    if balance:
        text(draw,(x+22,y+68),balance,37,'#f1f4fc',True)
        text(draw,(x+155,y+94),'剩余',14,'#a0abba')
        draw.rounded_rectangle((x+22,y+129,x+w-22,y+134),radius=2,fill='#4a515e')
        draw.rounded_rectangle((x+22,y+129,x+22+(w-44)*float(balance.rstrip('%'))/100,y+134),radius=2,fill='#91adff')
        offset=153
    for index,(label,value) in enumerate(rows):
        yy=y+offset+index*31
        text(draw,(x+22,yy),label,15,'#b8c1cf')
        right=draw.textbbox((0,0),value,font=font(15))[2]
        text(draw,(x+w-22-right,yy),value,15,'#e0e7f5')

def small_icon(draw,x,y,kind):
    color='#98a5bc'
    if kind=='calendar':
        draw.rounded_rectangle((x,y-2,x+12,y+10),radius=2,outline=color,width=1)
        draw.line((x,y+2,x+12,y+2),fill=color)
        draw.line((x+3,y-4,x+3,y),fill=color)
        draw.line((x+9,y-4,x+9,y),fill=color)
    else:
        draw.arc((x,y-3,x+12,y+9),0 if kind=='clock' else 155,360,fill=color,width=1)
        draw.line((x+6,y+3,x+9,y if kind=='gauge' else y+5),fill=color,width=1)
        if kind=='clock':draw.line((x+6,y+3,x+6,y-1),fill=color,width=1)

hero,d=canvas()
text(d,(86,58),'ANTIGRATIVE DASHBOARD',16,'#94adf9',True)
text(d,(82,110),'速度与额度，就在模型选择旁。',49,'#f1f4fb',True)
text(d,(86,196),'tok/s · 5h 余额 · 周余额 · 重置倒计时',24,'#aebbcf')
composer(d,(85,320,1230))
for x,title,description in [(86,'常驻缩略信息','无需打开独立面板'),(500,'悬停查看详情','保持输入框整洁'),(916,'可安装 · 可停用 · 可卸载','原始加载器备份与恢复')]:
    text(d,(x,509),title,23,'#e2e8f4',True)
    text(d,(x,552),description,17,'#909db2')
text(d,(86,627),'Windows / Antigravity App 2.19.1    ·    MIT    ·    示例数据',14,'#68758e')
hero.save(OUT/'hero.png')

demo,d=canvas(height=785)
text(d,(70,47),'少一点打扰，多一点确定。',32,'#edf2fa',True)
text(d,(71,99),'真实数据采集；这里使用示意数据展示样式。',18,'#8e9db4')
statcard(d,(78,193,386,345),'会话统计',[
    ('模型调用用时','2分18秒'),('工具调用用时','16.4秒'),('首 token 平均','2.38秒'),
    ('会话输出速率','104.6 tok/s'),('最近一次请求','112.8 tok/s'),('正文 / 思考输出','14,820 / 6,204 tok')])
statcard(d,(503,193,386,345),'5h 额度 · Gemini',[
    ('重置倒计时','02:46:18'),('重置时间','今天 20:28'),('额度组','Gemini')],balance='83.4%')
statcard(d,(928,193,386,345),'周额度 · Gemini',[
    ('重置倒计时','4天 13:24:06'),('重置时间','10/11 15:28'),('额度组','Gemini')],balance='61.7%')
composer(d,(70,590,1250))
demo.save(OUT/'widget.png')
print('Generated illustrative README assets:',OUT)
