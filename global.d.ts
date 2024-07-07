declare interface StructorSwitchDefinition {
    $switch: string;
    $cases: { [key: string]: StructorDefinition } | { $case: number, $format: StructorDefinition }[];
}

declare interface StructorFormatDefinition {
    $format: StructorDefinition | '$tell' | 'string' | 'buffer';
    $tell?: string;
    $repeat?: string | number;
    $goto?: string | number;
    $skip?: string | number;
    $value?: string;
    $foreach?: string;
    $ignore?: boolean;
}

declare type StructorMiscDefinition = {
    [key: string]: StructorDefinition
};

declare type StructorDefinition =
    | StructorFormatDefinition
    | StructorSwitchDefinition
    | StructorMiscDefinition
    | string
    | string[];

