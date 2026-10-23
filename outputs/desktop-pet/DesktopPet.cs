using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Input;
using System.Windows.Threading;

namespace AiGirlPet {
  // Each character/form/state keeps its own shuffled deck for this app session.
  public class CaptionDeck {
    readonly Random random = new Random();
    readonly Dictionary<string,Queue<string>> decks = new Dictionary<string,Queue<string>>();
    readonly Dictionary<string,string> previous = new Dictionary<string,string>();
    public string Next(string key,string[] lines) {
      Queue<string> deck;
      if(!decks.TryGetValue(key,out deck)||deck.Count==0){
        var shuffled=new List<string>(lines);
        for(int i=shuffled.Count-1;i>0;i--){int j=random.Next(i+1);string temp=shuffled[i];shuffled[i]=shuffled[j];shuffled[j]=temp;}
        string last;
        if(shuffled.Count>1&&previous.TryGetValue(key,out last)&&shuffled[0]==last){string temp=shuffled[0];shuffled[0]=shuffled[1];shuffled[1]=temp;}
        deck=new Queue<string>(shuffled);decks[key]=deck;
      }
      string line=deck.Dequeue();previous[key]=line;return line;
    }
  }
  public class PetWindow : Window {
    static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
    readonly string root, runtime;
    readonly Dictionary<string, object> data;
    readonly object[] chars;
    readonly Image sprite = new Image();
    readonly TextBlock speech = new TextBlock(), status = new TextBlock(), name = new TextBlock();
    readonly Border bubble = new Border();
    readonly Grid surface = new Grid();
    readonly TranslateTransform motion = new TranslateTransform();
    readonly Dictionary<string, BitmapImage> images = new Dictionary<string, BitmapImage>();
    readonly DispatcherTimer timer = new DispatcherTimer();
    readonly Stopwatch clock = Stopwatch.StartNew();
    readonly Dictionary<string,object> settings;
    readonly CaptionDeck captions = new CaptionDeck();
    const double CaptionSeconds = 12;
    string captionKey="", captionText="";
    double nextCaption=0;
    int captionSerial=0, captionPoolSize=0;
    Process bridge;
    string state="idle", art="idle", label="暂无任务", lastView="", manualState=null;
    int character=0, form=0, active=0, waiting=0;
    bool rotating=true, follow=true, shutting=false;
    double nextRotation=0, interval=8, scale=1;
    long lastHookAt=0;
    int frame=0;
    MenuItem rotationItem, followItem;

    static Dictionary<string,object> Obj(object v) {return v as Dictionary<string,object> ?? new Dictionary<string,object>();}
    static string Str(Dictionary<string,object> v,string k,string fallback="") {return v.ContainsKey(k)&&v[k]!=null?Convert.ToString(v[k]):fallback;}
    static double Num(Dictionary<string,object> v,string k,double fallback=0) {double d;return double.TryParse(Str(v,k),out d)?d:fallback;}
    static bool Flag(Dictionary<string,object> v,string k,bool fallback) {bool b;return bool.TryParse(Str(v,k),out b)?b:fallback;}
    static Dictionary<string,object> Read(string p) {try{return Obj(Json.DeserializeObject(File.ReadAllText(p,Encoding.UTF8)));}catch{return new Dictionary<string,object>();}}
    static Brush Color(string s){return (Brush)new BrushConverter().ConvertFromString(s);}
    public PetWindow(string folder) {
      root=folder;runtime=Path.Combine(root,"runtime");Directory.CreateDirectory(runtime);
      data=Read(Path.Combine(root,"characters.json"));chars=(object[])data["characters"];
      settings=Read(Path.Combine(runtime,"settings.json"));
      character=(int)Num(settings,"character",0);if(character<0||character>=chars.Length)character=0;
      form=(int)Num(settings,"form",0)==1?1:0;rotating=Flag(settings,"rotate",true);
      interval=Num(settings,"interval",8);if(interval<4)interval=8;scale=Num(settings,"scale",1);if(scale<.6||scale>1.6)scale=1;
      Title="AI 娘桌宠";Width=300*scale;Height=410*scale;WindowStyle=WindowStyle.None;AllowsTransparency=true;Background=Brushes.Transparent;
      ShowInTaskbar=false;Topmost=Flag(settings,"topmost",true);ResizeMode=ResizeMode.NoResize;
      var work=SystemParameters.WorkArea;
      Left=Num(settings,"left",work.Right-Width-24);
      Top=Num(settings,"top",work.Bottom-Height-16);
      var box=new Viewbox{Stretch=Stretch.Uniform};surface.Width=300;surface.Height=410;box.Child=surface;Content=box;
      surface.RowDefinitions.Add(new RowDefinition{Height=new GridLength(104)});
      surface.RowDefinitions.Add(new RowDefinition{Height=new GridLength(280)});
      surface.RowDefinitions.Add(new RowDefinition{Height=new GridLength(26)});
      var texts=new StackPanel();
      status.FontSize=11;status.Foreground=Color("#CACBE0");status.HorizontalAlignment=HorizontalAlignment.Center;status.Margin=new Thickness(0,0,0,6);
      speech.FontSize=13;speech.FontFamily=new FontFamily("Microsoft YaHei UI");speech.Foreground=Brushes.White;speech.TextWrapping=TextWrapping.Wrap;speech.TextAlignment=TextAlignment.Center;
      texts.Children.Add(status);texts.Children.Add(speech);
      bubble.Child=texts;bubble.Background=Color("#F2242534");bubble.BorderBrush=Color("#805F657D");bubble.BorderThickness=new Thickness(1);bubble.CornerRadius=new CornerRadius(18);
      bubble.Padding=new Thickness(15,10,15,10);bubble.Margin=new Thickness(16,2,16,5);bubble.VerticalAlignment=VerticalAlignment.Bottom;surface.Children.Add(bubble);
      sprite.Stretch=Stretch.Uniform;sprite.Height=270;sprite.Width=270;sprite.VerticalAlignment=VerticalAlignment.Bottom;sprite.HorizontalAlignment=HorizontalAlignment.Center;
      sprite.RenderTransform=motion;sprite.RenderTransformOrigin=new Point(.5,1);Grid.SetRow(sprite,1);surface.Children.Add(sprite);
      var chip=new Border{Background=Color("#E6242534"),CornerRadius=new CornerRadius(10),Padding=new Thickness(9,3,9,3),HorizontalAlignment=HorizontalAlignment.Center,VerticalAlignment=VerticalAlignment.Center};
      name.FontFamily=new FontFamily("Microsoft YaHei UI");name.FontSize=11;name.Foreground=Brushes.White;chip.Child=name;Grid.SetRow(chip,2);surface.Children.Add(chip);
      ToolTip="拖动角色移动 · 右键切换 / 设置 · 双击暂停轮换";
      MouseLeftButtonDown+=(s,e)=>{if(e.ClickCount==2){rotating=!rotating;rotationItem.IsChecked=rotating;Save();UpdateView();}else{try{DragMove();Save();}catch{}}};
      ContextMenu=MakeMenu();
      Loaded+=(s,e)=>{StartBridge();UpdateView();nextRotation=clock.Elapsed.TotalSeconds+interval;timer.Start();};
      Closing+=(s,e)=>{shutting=true;Save();timer.Stop();try{if(bridge!=null&&!bridge.HasExited)bridge.Kill();}catch{}};
      timer.Interval=TimeSpan.FromMilliseconds(50);timer.Tick+=(s,e)=>Tick();
    }
    MenuItem Item(string text,Action action){var m=new MenuItem{Header=text};m.Click+=(s,e)=>action();return m;}
    ContextMenu MakeMenu(){
      var menu=new ContextMenu();
      rotationItem=Item("自动轮换 10 种形态",()=>{rotating=rotationItem.IsChecked;nextRotation=clock.Elapsed.TotalSeconds+interval;Save();UpdateView();});rotationItem.IsCheckable=true;rotationItem.IsChecked=rotating;menu.Items.Add(rotationItem);
      followItem=Item("跟随 Codex 任务状态",()=>{follow=followItem.IsChecked;manualState=null;UpdateView();});followItem.IsCheckable=true;followItem.IsChecked=true;menu.Items.Add(followItem);
      menu.Items.Add(Item("换句台词",()=>{nextCaption=0;UpdateView();}));
      menu.Items.Add(new Separator());
      var choose=new MenuItem{Header="选择角色"};
      for(int i=0;i<chars.Length;i++){int n=i;var c=Obj(chars[i]);var sub=new MenuItem{Header=Str(c,"name")+" · "+Str(c,"nickname")};
        sub.Items.Add(Item("Q 版",()=>Select(n,0)));sub.Items.Add(Item("正常版",()=>Select(n,1)));choose.Items.Add(sub);}
      menu.Items.Add(choose);
      var timing=new MenuItem{Header="轮换间隔"};foreach(int sec in new int[]{4,8,15,30}){int n=sec;timing.Items.Add(Item(n+" 秒",()=>{interval=n;nextRotation=clock.Elapsed.TotalSeconds+interval;Save();}));}menu.Items.Add(timing);
      var size=new MenuItem{Header="角色大小"};foreach(int percent in new int[]{80,100,120}){int n=percent;size.Items.Add(Item(n+"%",()=>{scale=n/100.0;Width=300*scale;Height=410*scale;Save();}));}menu.Items.Add(size);
      var demo=new MenuItem{Header="试试看：状态演示"};
      foreach(string st in new string[]{"idle","working","complete","failed","waiting","interrupted","recovering"}){string val=st;demo.Items.Add(Item(StateLabel(st),()=>{manualState=val;follow=false;followItem.IsChecked=false;UpdateView();}));}menu.Items.Add(demo);
      menu.Items.Add(new Separator());
      var top=Item("总在最前",()=>{Topmost=!Topmost;Save();});top.IsCheckable=true;top.IsChecked=Topmost;menu.Items.Add(top);
      menu.Items.Add(Item("查看全家福",()=>OpenFile(Path.Combine(root,"..","AI娘全家福.png"))));
      menu.Items.Add(Item("使用说明与连接状态",()=>{WriteView();OpenFile(Path.Combine(root,"使用说明.md"));}));
      menu.Items.Add(Item("退出桌宠",()=>Close()));return menu;
    }
    void Select(int c,int f){character=c;form=f;nextRotation=clock.Elapsed.TotalSeconds+interval;Save();UpdateView();}
    void OpenFile(string p){try{Process.Start(new ProcessStartInfo(p){UseShellExecute=true});}catch{}}
    void StartBridge(){
      var cfg=Read(Path.Combine(root,"installation.json"));string node=Str(cfg,"node");
      bridge=Process.Start(new ProcessStartInfo(node,"\""+Path.Combine(root,"bridge.cjs")+"\" "+Process.GetCurrentProcess().Id){UseShellExecute=false,CreateNoWindow=true,WorkingDirectory=root});
    }
    static string StateLabel(string s){switch(s){case "working":return "进行中";case "complete":return "本轮结束 · 待查看";case "failed":return "运行异常";case "waiting":return "等你确认 / 回复";case "interrupted":return "已停止";case "recovering":return "遇到报错 · 正在排查";default:return "暂无任务";}}
    void Tick(){
      if(shutting)return;
      try{
        double t=clock.Elapsed.TotalSeconds;
        motion.Y=state=="working"?-2.0*Math.Abs(Math.Sin(t*3)):-1.5*Math.Sin(t*1.8);motion.X=state=="recovering"?1.3*Math.Sin(t*8):0;
        if(++frame%10!=0)return;
        if(rotating&&t>=nextRotation&&!ContextMenu.IsOpen){int pos=(character*2+form+1)%(chars.Length*2);character=pos/2;form=pos%2;nextRotation=t+interval;}
        if(follow){var incoming=Read(Path.Combine(runtime,"state.json"));if(incoming.ContainsKey("state")){state=Str(incoming,"state","idle");art=Str(incoming,"artState","idle");label=Str(incoming,"label","暂无任务");active=(int)Num(incoming,"activeCount");waiting=(int)Num(incoming,"waitingCount");lastHookAt=(long)Num(incoming,"lastHookAt");}}
        UpdateView();
        string cmd=Path.Combine(runtime,"ui-command.json");if(File.Exists(cmd)){var c=Read(cmd);File.Delete(cmd);HandleCommand(c);}
        if(frame%40==0)WriteView();
      }catch(Exception ex){File.AppendAllText(Path.Combine(runtime,"app-errors.log"),DateTime.Now.ToString("o")+" "+ex.Message+Environment.NewLine);}
    }
    void HandleCommand(Dictionary<string,object> c){
      switch(Str(c,"action")){
        case "select":character=(int)Num(c,"character",0);form=(int)Num(c,"form",0);rotating=Flag(c,"rotate",rotating);rotationItem.IsChecked=rotating;nextRotation=clock.Elapsed.TotalSeconds+interval;Save();UpdateView();break;
        case "demo":manualState=Str(c,"state","idle");follow=false;followItem.IsChecked=false;UpdateView();break;
        case "follow":follow=true;manualState=null;followItem.IsChecked=true;UpdateView();break;
        case "next-copy":nextCaption=0;UpdateView();break;
        case "capture":Capture(Str(c,"path"));break;
        case "show":Show();Activate();break;
        case "exit":Close();break;
      }
    }
    void UpdateView(){
      if(!follow&&manualState!=null){state=manualState;art=(state=="waiting"||state=="interrupted")?"idle":state=="recovering"?"failed":state;label="演示 · "+StateLabel(state);}
      var c=Obj(chars[character]);string id=Str(c,"id"), f=form==0?"chibi":"normal";
      string key=id+"-"+f+"-"+art;
      if(!images.ContainsKey(key)){var b=new BitmapImage();b.BeginInit();b.CacheOption=BitmapCacheOption.OnLoad;b.UriSource=new Uri(Path.Combine(root,"assets",key+".png"));b.EndInit();b.Freeze();images[key]=b;}
      sprite.Source=images[key];sprite.Height=form==0?225:270;
      string poolKey=id+"/"+f+"/"+state;
      if(captionKey!=poolKey||clock.Elapsed.TotalSeconds>=nextCaption){
        var all=Obj(c.ContainsKey("lines")?c["lines"]:null);var words=Obj(all.ContainsKey(f)?all[f]:null);
        object[] pool=words.ContainsKey(state)?words[state] as object[]:null;
        var lines=new List<string>();if(pool!=null)foreach(object value in pool)lines.Add(Convert.ToString(value));
        if(lines.Count==0)lines.Add(Str(Obj(c[f]),art));
        captionText=captions.Next(poolKey,lines.ToArray());captionKey=poolKey;captionPoolSize=lines.Count;captionSerial++;
        nextCaption=clock.Elapsed.TotalSeconds+CaptionSeconds;
      }
      speech.Text=captionText;status.Text=label+(follow&&active>1?" · "+active+" 个任务":"")+(follow&&waiting>0&&active>0?" · "+waiting+" 个待确认":"");
      name.Text=Str(c,"name")+" · "+(form==0?"Q 版":"正常版")+(rotating?"  ↻":"");
      bubble.BorderBrush=Color(Str(c,"color","#7979A0"));WriteView();
    }
    void WriteView(){
      var v=new Dictionary<string,object>{{"pid",Process.GetCurrentProcess().Id},{"visible",IsVisible},{"character",Str(Obj(chars[character]),"id")},{"form",form==0?"chibi":"normal"},{"state",state},{"artState",art},{"label",status.Text},{"caption",speech.Text},{"rotate",rotating},{"followCodex",follow},{"lastHookAt",lastHookAt},{"imageLoaded",sprite.Source!=null},{"left",Left},{"top",Top},{"width",Width},{"height",Height}};
      v["captionSerial"]=captionSerial;v["captionPoolSize"]=captionPoolSize;v["captionIntervalSeconds"]=CaptionSeconds;
      string json=Json.Serialize(v);if(json!=lastView){File.WriteAllText(Path.Combine(runtime,"view.json"),json,Encoding.UTF8);lastView=json;}
    }
    void Capture(string output){
      if(String.IsNullOrEmpty(output))return;UpdateLayout();var bmp=new RenderTargetBitmap((int)Math.Ceiling(ActualWidth),(int)Math.Ceiling(ActualHeight),96,96,PixelFormats.Pbgra32);bmp.Render(this);
      var encoder=new PngBitmapEncoder();encoder.Frames.Add(BitmapFrame.Create(bmp));using(var f=File.Create(output))encoder.Save(f);
    }
    void Save(){if(shutting&&Double.IsNaN(Left))return;var v=new Dictionary<string,object>{{"character",character},{"form",form},{"rotate",rotating},{"interval",interval},{"scale",scale},{"topmost",Topmost},{"left",Left},{"top",Top}};File.WriteAllText(Path.Combine(runtime,"settings.json"),Json.Serialize(v),Encoding.UTF8);}
  }
  public static class Program {
    [STAThread] public static void Main(){
      string root=AppDomain.CurrentDomain.BaseDirectory;Directory.CreateDirectory(Path.Combine(root,"runtime"));
      bool created;using(var mutex=new Mutex(true,"Local\\AiGirlPetDesktop_v1",out created)){
        if(!created){File.WriteAllText(Path.Combine(root,"runtime","ui-command.json"),"{\"action\":\"show\"}");return;}
        try{var app=new Application();app.Run(new PetWindow(root));}
        catch(Exception e){File.AppendAllText(Path.Combine(root,"runtime","startup-errors.log"),DateTime.Now.ToString("o")+" "+e.ToString()+Environment.NewLine);}
      }
    }
  }
}
