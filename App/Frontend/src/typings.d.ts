// # 3rd Party Library
// If the library doesn't have typings available at `@types/`,
// you can still use it by manually adding typings for it
declare var module: NodeModule;
interface NodeModule {
  id: string;
}
declare var System: any;
declare var $: any;

// G2
declare var G2: any;
declare var DataSet: any;
declare var Slider: any;