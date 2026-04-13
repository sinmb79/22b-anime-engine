import argparse
import json
import math
import os
import sys

import bpy


def parse_args():
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    else:
        argv = []

    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--frames-dir", required=True)
    return parser.parse_args(argv)


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = (
        "BLENDER_EEVEE_NEXT"
        if "BLENDER_EEVEE_NEXT" in bpy.app.build_options.__dir__()
        else "BLENDER_EEVEE"
    )
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    return scene


def ensure_collection(name):
    collection = bpy.data.collections.get(name)
    if collection is None:
        collection = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(collection)
    return collection


def load_manifest(path):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def make_image_material(name, image_path):
    image = bpy.data.images.load(image_path, check_existing=True)
    material = bpy.data.materials.new(name=name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()

    output = nodes.new(type="ShaderNodeOutputMaterial")
    shader = nodes.new(type="ShaderNodeBsdfPrincipled")
    texture = nodes.new(type="ShaderNodeTexImage")
    texture.image = image

    shader.inputs["Roughness"].default_value = 1.0
    if "Specular IOR Level" in shader.inputs:
        shader.inputs["Specular IOR Level"].default_value = 0.0
    elif "Specular" in shader.inputs:
        shader.inputs["Specular"].default_value = 0.0

    links.new(texture.outputs["Color"], shader.inputs["Base Color"])
    if "Alpha" in texture.outputs and "Alpha" in shader.inputs:
        links.new(texture.outputs["Alpha"], shader.inputs["Alpha"])
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])

    material.blend_method = "BLEND"
    material.shadow_method = "NONE"
    return material, image


def create_plane(name, image_path, pivot_x, pivot_y, depth, collection):
    material, image = make_image_material(f"{name}_mat", image_path)
    width = max(1, int(image.size[0]))
    height = max(1, int(image.size[1]))

    left = -pivot_x * width
    right = (1.0 - pivot_x) * width
    top = pivot_y * height
    bottom = -(1.0 - pivot_y) * height

    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(
        [(left, bottom, 0), (right, bottom, 0), (right, top, 0), (left, top, 0)],
        [],
        [(0, 1, 2, 3)],
    )
    mesh.update()

    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(material)
    obj.location[2] = depth
    collection.objects.link(obj)
    return obj


def top_level_position(x, y, width, height):
    return (x - (width / 2.0), -(y - (height / 2.0)))


def local_position(x, y):
    return (x, -y)


def apply_transform(obj, transform, width, height, top_level):
    if top_level:
        loc_x, loc_y = top_level_position(transform.get("x", 0), transform.get("y", 0), width, height)
    else:
        loc_x, loc_y = local_position(transform.get("x", 0), transform.get("y", 0))

    depth = obj.location[2]
    obj.location = (loc_x, loc_y, depth)
    obj.rotation_euler = (0.0, 0.0, math.radians(-transform.get("rotation", 0)))
    obj.scale = (
        transform.get("scaleX", 1.0),
        transform.get("scaleY", 1.0),
        1.0,
    )


def keyframe_transform(obj, base_transform, keyframes, fps, width, height, top_level):
    state = dict(base_transform)
    apply_transform(obj, state, width, height, top_level)
    obj.keyframe_insert(data_path="location", frame=1)
    obj.keyframe_insert(data_path="rotation_euler", frame=1)
    obj.keyframe_insert(data_path="scale", frame=1)

    for keyframe in keyframes or []:
        state.update(keyframe.get("transform", {}))
        apply_transform(obj, state, width, height, top_level)
        frame = max(1, int(round(keyframe["time"] * fps)) + 1)
        obj.keyframe_insert(data_path="location", frame=frame)
        obj.keyframe_insert(data_path="rotation_euler", frame=frame)
        obj.keyframe_insert(data_path="scale", frame=frame)


def create_empty(name, depth, collection):
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = "PLAIN_AXES"
    obj.location[2] = depth
    collection.objects.link(obj)
    return obj


def first_frame_path(asset_entry):
    frame_paths = asset_entry.get("framePaths") or {}
    if not frame_paths:
        return asset_entry.get("absolutePath")
    first_key = sorted(frame_paths.keys())[0]
    return frame_paths[first_key]


def selected_sprite_path(part, asset_lookup):
    if part.get("spriteSwitch"):
        asset = asset_lookup.get(part["spriteSwitch"]["assetId"])
        if not asset:
            return None
        frame_paths = asset.get("framePaths") or {}
        switch_keys = part["spriteSwitch"].get("keyframes", [])
        if switch_keys:
            wanted = switch_keys[0].get("frame")
            if wanted in frame_paths:
                return frame_paths[wanted]
        return first_frame_path(asset)

    asset = asset_lookup.get(part["assetId"])
    if not asset:
        return None
    return asset.get("absolutePath") or first_frame_path(asset)


def configure_camera(scene, camera_obj, camera_track, width, height, fps):
    camera_obj.data.type = "ORTHO"
    initial = camera_track["initialTransform"]
    cam_x, cam_y = top_level_position(initial["x"], initial["y"], width, height)
    camera_obj.location = (cam_x, cam_y, 1000.0)
    camera_obj.data.ortho_scale = width / max(initial.get("zoom", 1.0), 0.0001)
    camera_obj.keyframe_insert(data_path="location", frame=1)
    camera_obj.data.keyframe_insert(data_path="ortho_scale", frame=1)

    state = dict(initial)
    for keyframe in camera_track.get("keyframes", []):
        for key in ("x", "y", "zoom"):
            if key in keyframe:
                state[key] = keyframe[key]
        cam_x, cam_y = top_level_position(state["x"], state["y"], width, height)
        camera_obj.location = (cam_x, cam_y, 1000.0)
        camera_obj.data.ortho_scale = width / max(state.get("zoom", 1.0), 0.0001)
        frame = max(1, int(round(keyframe["time"] * fps)) + 1)
        camera_obj.keyframe_insert(data_path="location", frame=frame)
        camera_obj.data.keyframe_insert(data_path="ortho_scale", frame=frame)


def main():
    args = parse_args()
    manifest = load_manifest(args.manifest)
    render_cfg = manifest["render"]
    scene_data = manifest["scene"]
    width = render_cfg["width"]
    height = render_cfg["height"]
    fps = render_cfg["fps"]
    total_frames = render_cfg["totalFrames"]

    os.makedirs(args.frames_dir, exist_ok=True)
    scene = reset_scene()
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.filepath = os.path.join(args.frames_dir, "frame_")
    scene.frame_start = 1
    scene.frame_end = total_frames
    scene.render.fps = fps

    collection = ensure_collection("Shot")
    asset_lookup = {asset["id"]: asset for asset in manifest["assets"]}

    camera_data = bpy.data.cameras.new("ShotCamera")
    camera_obj = bpy.data.objects.new("ShotCamera", camera_data)
    collection.objects.link(camera_obj)
    scene.camera = camera_obj
    configure_camera(scene, camera_obj, scene_data["camera"], width, height, fps)

    for order, layer in enumerate(sorted(scene_data["layers"], key=lambda item: item["zIndex"])):
        depth = (layer["zIndex"] * 0.1) + (order * 0.0001)

        if layer["type"] in {"background", "prop"}:
            asset = asset_lookup.get(layer["assetId"])
            image_path = None if asset is None else asset.get("absolutePath") or first_frame_path(asset)
            if not image_path or not os.path.exists(image_path):
                continue

            plane = create_plane(
                layer["id"],
                image_path,
                layer["transform"].get("anchorX", 0.5),
                layer["transform"].get("anchorY", 0.5),
                depth,
                collection,
            )
            plane.hide_render = not layer.get("visible", True)
            keyframe_transform(plane, layer["transform"], layer.get("keyframes"), fps, width, height, True)

        elif layer["type"] == "character":
            root = create_empty(layer["id"], depth, collection)
            keyframe_transform(root, layer["transform"], layer.get("keyframes"), fps, width, height, True)
            root.hide_render = not layer.get("visible", True)

            part_objects = {}
            for part_index, part in enumerate(layer["parts"]):
                image_path = selected_sprite_path(part, asset_lookup)
                if not image_path or not os.path.exists(image_path):
                    continue

                pivot = part.get("pivot", {})
                plane = create_plane(
                    f"{layer['id']}__{part['id']}",
                    image_path,
                    pivot.get("x", part["transform"].get("anchorX", 0.5)),
                    pivot.get("y", part["transform"].get("anchorY", 0.5)),
                    part_index * 0.001,
                    collection,
                )

                parent_id = part.get("parentPartId")
                plane.parent = part_objects[parent_id] if parent_id in part_objects else root
                plane.hide_render = not layer.get("visible", True)
                keyframe_transform(plane, part["transform"], part.get("keyframes"), fps, width, height, False)
                part_objects[part["id"]] = plane

    bpy.ops.render.render(animation=True)


if __name__ == "__main__":
    main()
