import json
import argparse
import os

import assemble
import breakup
import config as cfg
import expstruct
import diceasm

class Dummy:
    pass

def main():
    parser = argparse.ArgumentParser(description="运行拆分和重组脚本")
    parser.add_argument('-g', '--genconfig', help='运行config.py自动生成配置文件', action='store_true')
    parser.add_argument('-a', '--assemble', help='运行assemble.py', action='store_true')
    parser.add_argument('-b', '--breakup', help='运行breakup.py', action='store_true')

    parser.add_argument('-c', '--config', type=str, help='配置文件路径')
    parser.add_argument('-d', '--dir', type=str, help='解包文件路径，应为ExportedProject的上级目录')

    args = parser.parse_args()

    if expstruct.is_dice_exportion(args.dir):
        print("\033[34mAnalysing dice sprite exportion structure\033[0m")
        export_struct = expstruct.analyse_dice_exportion(args.dir)
        arglist = Dummy()
        arglist.output = os.path.join('output', export_struct.name)
        arglist.texture = export_struct.texture_path
        arglist.file = export_struct.sprite_path_list
        diceasm.main(arglist)
        return

    json_path = args.config if args.config is not None else "config.json"

    if not args.assemble and not args.breakup and not args.genconfig:
        args.assemble = True
        args.breakup = True
        args.genconfig = True

    if args.genconfig and args.config is None:
        # Generate config file
        print("\033[34mGenerating config file\033[0m")
        arglist = Dummy()
        arglist.dir = args.dir
        arglist.output = './configs'
        json_path = cfg.main(arglist)

    with open(json_path, 'r', encoding='utf-8') as f:
        config = json.load(f)
    # print(f"config: {config}")
    # parsed_config = parse_config(config)

    if args.breakup:
        # Produce sprites
        print("\033[34mProducing sprites\033[0m")
        parsed_config = Dummy()
        parsed_config.output = config['output_dir_sprite']
        parsed_config.dir = config['export_dir']
        # parsed_config
        breakup.main(parsed_config)

    if args.assemble:
        # Produce figures
        print("\033[34mProducing figures\033[0m")
        parsed_config = Dummy()
        parsed_config.dir = config['export_dir']
        parsed_config.output = config['output_dir_figure']
        # parsed_config.output = config['output_dir_figure']
        # for composition in config['composite_keys_list']:
        parsed_config.compositionKeys = config['composite_keys_list']
        # print(f"parsed_config: {parsed_config}")
        assemble.main(parsed_config)

if __name__ == "__main__":
    main()