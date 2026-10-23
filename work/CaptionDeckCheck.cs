using System;
using System.IO;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using AiGirlPet;
public static class CaptionDeckCheck {
  public static int Main(string[] args) {
    var data=(Dictionary<string,object>)new JavaScriptSerializer().DeserializeObject(File.ReadAllText(args[0]));
    var deck=new CaptionDeck();int pools=0,draws=0;
    var all=new Dictionary<string,string[]>();
    foreach(object value in (object[])data["characters"]){
      var c=(Dictionary<string,object>)value;var forms=(Dictionary<string,object>)c["lines"];
      foreach(var form in forms)foreach(var state in (Dictionary<string,object>)form.Value){
        var lines=new List<string>();foreach(object s in (object[])state.Value)lines.Add((string)s);
        all[c["id"]+"/"+form.Key+"/"+state.Key]=lines.ToArray();pools++;
      }
    }
    var last=new Dictionary<string,string>();
    // Interleaving pools checks that role/state switches do not reset their decks.
    for(int round=0;round<80;round++)foreach(var pool in all){
      var seen=new HashSet<string>();
      for(int i=0;i<pool.Value.Length;i++){
        string line=deck.Next(pool.Key,pool.Value),previous;
        if(!seen.Add(line)||Array.IndexOf(pool.Value,line)<0)throw new Exception("Wrong or repeated line: "+pool.Key);
        if(last.TryGetValue(pool.Key,out previous)&&line==previous)throw new Exception("Repeat at shuffle boundary: "+pool.Key);
        last[pool.Key]=line;draws++;
      }
    }
    Console.WriteLine("PASS: "+pools+" independent pools; "+draws+" draws; no missing lines or consecutive repeats.");return 0;
  }
}
