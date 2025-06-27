// Type declarations to fix missing types in dependencies

// Fix for web-tree-sitter missing EmscriptenModule type
declare interface EmscriptenModule {
  locateFile?: (path: string, scriptDirectory: string) => string;
  [key: string]: any;
}